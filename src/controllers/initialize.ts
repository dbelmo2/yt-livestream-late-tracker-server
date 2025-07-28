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
  let streamCount = 0;
  let totalLateTime = 0;
  let maxLateTime = 0;
  
  // Track late time by day of week (0 = Sunday, 1 = Monday, etc.)
  const dailyStats = {
    0: { totalTime: 0, count: 0 }, // Sunday
    1: { totalTime: 0, count: 0 }, // Monday
    2: { totalTime: 0, count: 0 }, // Tuesday
    3: { totalTime: 0, count: 0 }, // Wednesday
    4: { totalTime: 0, count: 0 }, // Thursday
    5: { totalTime: 0, count: 0 }, // Friday
    6: { totalTime: 0, count: 0 }, // Saturday
  };

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

    // Now that we have a unique set of video IDs, we can fetch their details
    const videoResponse = await youtube.videos.list({
      part: ['snippet', 'liveStreamingDetails'],
      id: Array.from(videoIdSet),
    });

    logger.info(`Fetched livestream details for ${videoResponse.data.items?.length} videos`);

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      logger.warn(`No livestream data found in the video.list API for current page`);
      continue;
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
        
        // Update total late time
        totalLateTime += lateTime;
        
        // Update max late time
        if (lateTime > maxLateTime) {
          maxLateTime = lateTime;
        }
        
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
    nextPageToken = response.data.nextPageToken as string | undefined;
    logger.info(`${livestreamDocuments.length} livestream documents built so far... nextPageToken: ${nextPageToken}`);
  } while (nextPageToken);

  streamCount = livestreamDocuments.length;
  

  // Once we have all the livestream documents, perform bulk insert
  await gracefulBulkInsert(livestreamDocuments as unknown as ILivestream[]);
  const updatedStats = await updateStats(livestreamDocuments as unknown as ILivestream[]);
  console.log(`Updated stats return object: ${JSON.stringify(updatedStats)}`);
  res.status(200).json({
    message: 'Initialization complete',
    streamCount: updatedStats.streamCount,
    totalLateTime: updatedStats.totalLateTime,
    averageLateTime: updatedStats.averageLateTime,
    max: updatedStats.max,
    daily: updatedStats.daily,
  });

};