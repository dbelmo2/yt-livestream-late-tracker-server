import { Request, Response } from 'express';
import Livestream from '../models/livestream';
import Stats from '../models/stats';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';
import youtube from '../config/youtube';
import { calculateLateTime, formatSecondsToHumanReadable } from '../utils/time';
import { config } from '../config/env';
import { ILivestream } from '../types/livestream';



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
  const livestreamDocumnets: ILivestream[] = [];
  let streamCount = 0;
  let totalLateTime = 0;
  do {
    videoIdSet.clear();
    logger.info(`Fetching livestreams from uploads playlist`);
    const response = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken: nextPageToken,
    });

    logger.info(`Playlist response length: ${response.data.items?.length}`);
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
    logger.info(`Of the ${response.data.items?.length} video IDs from the playlist, ${videoIdSet.size} are unique`);


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



    for (const broadcast of videoResponse.data.items) {
      if (!broadcast.id) {
        logger.warn(`Broadcast ID is missing, skipping broadcast with title ${broadcast?.snippet?.title}`);
        continue
      }
      if (
        broadcast?.liveStreamingDetails?.scheduledStartTime &&
        broadcast?.liveStreamingDetails?.actualStartTime
      ) {
        const lateTime = calculateLateTime(
          broadcast.liveStreamingDetails.scheduledStartTime,
          broadcast.liveStreamingDetails.actualStartTime
        );
        totalLateTime += lateTime;
        livestreamDocumnets.push({
          videoId: broadcast.id,
          scheduledStartTime: new Date(Date.parse(broadcast.liveStreamingDetails.scheduledStartTime)),
          actualStartTime: new Date(Date.parse(broadcast.liveStreamingDetails.actualStartTime)),
          lateTime,
          title: broadcast?.snippet?.title || 'Title not available',
        });
        continue;
      }
      logger.info(`Broadcast with ID ${broadcast.id} does not have scheduled or actual start time, skipping.`);
    }
    nextPageToken = response.data.nextPageToken as string | undefined;
    logger.info(`${livestreamDocumnets.length} livestream documents built so far... nextPageToken: ${nextPageToken}`);
  } while(nextPageToken);
  streamCount = livestreamDocumnets.length;
  // Once we have all the livestream documents, we can perform a bulk insert
  // which will gracefully handle duplicates and other errors
  await gracefulBulkInsert(livestreamDocumnets as unknown as ILivestream[]);
      
  // Update stats
  await Stats.create({ streamCount, totalLateTime });
  logger.info(`Initialized with ${streamCount} livestreams, total late time: ${totalLateTime}s or ${formatSecondsToHumanReadable(totalLateTime)}`);
  res.status(200).json({
    message: 'Initialization complete',
    streamCount,
    totalLateTime
  });

}