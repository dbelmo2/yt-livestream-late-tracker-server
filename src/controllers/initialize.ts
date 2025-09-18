import { Request, Response } from 'express';
import Livestream from '../models/livestream';
import Stats from '../models/stats';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';
import youtube from '../config/youtube';
import { calculateLateTime } from '../utils/time';
import { config } from '../config/env';
import { ILivestream } from '../types/livestream';
import { updateStats } from '../services/scheduler';



export const gracefulBulkInsert = async (livestreams: ILivestream[]) => {
  try {
    if (livestreams.length === 0) {
      logger.warn('No livestreams to insert into the database');
      return;
    }
    logger.info(`Inserting ${livestreams.length} livestreams into the database`);
    await Livestream.insertMany(livestreams, { ordered: false });
    logger.info(`Successfully inserted ${livestreams.length} livestreams`); 
  } catch (err: any) {
    if (err.code === 11000) {
      logger.warn('Some documents were not inserted due to duplicate keys.');

    } else {
      logger.error(`Bulk insert failed: ${err.message}`);
      throw err;
    }
  }
}

const processVideoIds = async (videoIdSet: Set<string>  ) => {

    const livestreamDocuments: ILivestream[] = [];
    const videoResponse = await youtube.videos.list({
      part: ['snippet', 'liveStreamingDetails'],
      id: Array.from(videoIdSet),
    });
    
    logger.info(`Fetched livestream details for ${videoResponse.data.items?.length} videos`);

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      logger.warn(`No livestream data found in the video.list API for current page`);
      return [];
    }


    // Filter out livestreams that already exist in the database to avoid 
    // messing up the stats.
    // Logs showing non empty newLivetreams array when there are no new livestreams can happen
    // due to the API returning livestreams that are missing data and where therefore never saved to the database.


    const existingLivestreams = await Livestream.find({ videoId: { $in: Array.from(videoIdSet) } });
    const newLivestreams = videoResponse.data.items.filter(video =>
      !existingLivestreams.some(existing => existing.videoId === video.id)
    )

    console.log(`Of the ${videoResponse.data.items.length} videos fetched, ${newLivestreams.length} are new livestreams not in the database`);

    for (const broadcast of newLivestreams) {

      if (!broadcast.id) {
        logger.warn(`Broadcast ID is missing, skipping broadcast with title ${broadcast?.snippet?.title}`);
        continue;
      }
      if (
        broadcast?.liveStreamingDetails?.scheduledStartTime &&
        broadcast?.liveStreamingDetails?.actualStartTime
      ) {
        const lateTime = calculateLateTime(
          broadcast.liveStreamingDetails.scheduledStartTime,
          broadcast.liveStreamingDetails.actualStartTime
        );
        
        // Calculate day of week for scheduled start time
        const scheduledDate = new Date(Date.parse(broadcast.liveStreamingDetails.scheduledStartTime));
        
        livestreamDocuments.push({
          videoId: broadcast.id,
          scheduledStartTime: scheduledDate,
          actualStartTime: new Date(Date.parse(broadcast.liveStreamingDetails.actualStartTime)),
          lateTime,
          title: broadcast?.snippet?.title || 'No title available',
        });
        continue;
      }
      logger.debug(`Broadcast with ID ${broadcast.id} and title ${broadcast?.snippet?.title} does not have scheduled or actual start time, skipping.`);
    }
    logger.info(`${livestreamDocuments.length} livestream documents built.`);
    return livestreamDocuments;
}

// Also add API for which day of the week has the highest average late time, and how much. This will need an inintialize function (with the hard/recent option),
// and also a function to process a single livestream, which will be used in the webhook handler.


export const handleInitialize = async (req: Request, res: Response): Promise<void> => {
  const channelslistResponse = await youtube.channels.list({
    part: ['contentDetails'],
    id: [config.youtubeChannelId],
  });

  const uploadsPlaylistId = channelslistResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new ApiError(`No uploads playlist found for channel ID ${config.youtubeChannelId}. Unable to initialize`, 500);
  }

  logger.info(`Retrieved uploads playlist ID: ${uploadsPlaylistId}`);

  let nextPageToken: string | undefined;
  let videoIdSet = new Set<string>();
  const livestreamDocuments: ILivestream[] = [];
  let totalLateTime = 0;
  


  do {
    videoIdSet.clear();
    const response = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });

    if (response.data.items) {
      for (const item of response.data.items) {
        if (item.snippet?.resourceId?.videoId) {
          if (videoIdSet.has(item.snippet.resourceId.videoId)) {
            logger.warn(`Duplicate videoId found in playlist items: ${item.snippet.resourceId.videoId}`);
          } else {
            videoIdSet.add(item.snippet.resourceId.videoId);
          }
        }
      }
    }

    const newLivestreams = await processVideoIds(videoIdSet);
    if (!newLivestreams || newLivestreams.length === 0) {
      logger.info('No new livestreams found in this batch, ending initialization early.');
      continue;
    }

    totalLateTime = newLivestreams.reduce((sum, ls) => sum + ls.lateTime, 0);
    livestreamDocuments.push(...newLivestreams);
    nextPageToken = response.data.nextPageToken as string | undefined;

  } while (nextPageToken);

  
  if (livestreamDocuments.length === 0) {
    logger.warn('No new livestreams found in the uploads playlist');
  } else {
    logger.info(`Found ${livestreamDocuments.length} new livestreams to process`);
    // Once we have all the livestream documents, perform bulk insert
    await gracefulBulkInsert(livestreamDocuments as unknown as ILivestream[]);
    await updateStats(livestreamDocuments as unknown as ILivestream[]);
  }

  const updatedStats = await Stats.findOne({}).lean();

  if (!updatedStats && livestreamDocuments.length === 0) {
    let errorMessage = 'No livestreams processed and no stats found in the database';
    logger.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  } else if (!updatedStats && livestreamDocuments.length > 0) {
    let errorMessage = 'New livestreams were processed but no stats found in the database. This is should not happen.';
    logger.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  } else if (updatedStats) {
    res.status(200).json({
      message: `Initialization complete. Found ${livestreamDocuments.length} new livestreams and updated stats.`,
      streamCount: updatedStats.streamCount,
      totalLateTime: updatedStats.totalLateTime,
      averageLateTime: updatedStats.averageLateTime,
      mostRecent: updatedStats.mostRecent,
      max: updatedStats.max,
      daily: updatedStats.daily,
  });
  }


};

export const handleInitializeByVideoIds = async (req: Request, res: Response): Promise<void> => {
  const { videoIds } = req.body;
  if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
    res.status(400).json({ error: 'videoIds must be a non-empty array' });
    return;
  }

  const BULK_LIMIT = 50;
  const livestreamDocuments: ILivestream[] = [];
  const nonduplicateVideoIdsArray = Array.from(new Set(videoIds));

  for (let i = 0; i < nonduplicateVideoIdsArray.length; i += BULK_LIMIT) {
    const chunk = nonduplicateVideoIdsArray.slice(i, i + BULK_LIMIT);
    const newLivestreams = await processVideoIds(new Set(chunk));
    livestreamDocuments.push(...newLivestreams);
  }

  if (!livestreamDocuments || livestreamDocuments.length === 0) {
    logger.info('No new livestreams found for the provided video IDs');
    res.status(200).json({ message: 'No new livestreams found' });
    return;
  }

  logger.info(`Found ${livestreamDocuments.length} new livestreams for the provided video IDs`);
  await gracefulBulkInsert(livestreamDocuments as unknown as ILivestream[]);
  await updateStats(livestreamDocuments as unknown as ILivestream[]);

  const updatedStats = await Stats.findOne({}).lean();

  if (!updatedStats && livestreamDocuments.length === 0) {
    let errorMessage = 'No livestreams processed and no stats found in the database';
    logger.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  } else if (!updatedStats && livestreamDocuments.length > 0) {
    let errorMessage = 'New livestreams were processed but no stats found in the database. This is should not happen.';
    logger.error(errorMessage);
    res.status(500).json({ error: errorMessage });
  } else if (updatedStats) {
    res.status(200).json({
      message: `Initialization by videoIds complete. Found ${livestreamDocuments.length} new livestreams and updated stats.`,
      streamCount: updatedStats.streamCount,
      totalLateTime: updatedStats.totalLateTime,
      averageLateTime: updatedStats.averageLateTime,
      mostRecent: updatedStats.mostRecent,
      max: updatedStats.max,
      daily: updatedStats.daily,
  });
  }
};
