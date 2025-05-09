import cron from 'node-cron';
import { subscribeToChannel } from './youtube';
import { config } from '../config/env';
import logger from '../utils/logger';
import youtube from '../config/youtube';
import Livestream from '../models/livestream';
import Stats from '../models/stats';
import { calculateLateTime } from '../utils/time';
import { FailedLivestream } from '../models/failedLivestreams';
import { ApiError } from '../utils/errors';
import { formatSecondsToHumanReadable } from '../utils/time';

// TODO: Handle duplicate key MongoDB error after a livestream goes live. 
// These errors should be handled gracefully by simply logging a warning and NOT inserting into the failedLivestreams collection
// Because the duplicate comes almost immediately after the valid livestream, the check below does not work... 
export const processLivestream = async (videoId: string): Promise<void> => {
    try {
      logger.debug(`Processing livestream with videoId: ${videoId}`);
      const response = await youtube.videos.list({
        part: ['snippet,liveStreamingDetails'],
        id: [videoId],
      });
      const livestream = response?.data?.items?.[0] ?? null;

      logger.debug(`Livestream data: ${JSON.stringify(livestream)}`);

      if (livestream) {
        const existing = await Livestream.findOne({ videoId });
        logger.debug(`Existing livestream: ${JSON.stringify(existing)}`);
        if (existing && livestream?.snippet?.title && livestream?.snippet?.title !== existing?.title) {
          await Livestream.updateOne(
            { videoId },
            { title: livestream?.snippet?.title }
          );
          logger.info(`Updated title for livestream ${videoId} to ${livestream?.snippet?.title}`);
          return;
        } else if (livestream?.snippet?.liveBroadcastContent !== 'none') {
          const { scheduledStartTime, actualStartTime } = livestream.liveStreamingDetails || {};
          if (!scheduledStartTime || !actualStartTime) {
            logger.warn(`Missing start times for livestream ${videoId}. Skipping.`);
            await FailedLivestream.deleteOne({ videoId });
            return;
          }
          const lateTime = calculateLateTime(scheduledStartTime, actualStartTime);
          logger.info(`Calculated late time for livestream ${videoId}: ${lateTime}s or ${formatSecondsToHumanReadable(lateTime)}`);
          const title = livestream?.snippet?.title || 'No title available';


          const livestreamDocument = {
            videoId,
            scheduledStartTime,
            actualStartTime,
            lateTime,
            title,
          };
          await Livestream.create(livestreamDocument);
          await Stats.updateOne(
            {},
            { $inc: { totalLateTime: lateTime, streamCount: 1 }, lastUpdateDate: new Date() },  
            { upsert: true }
          );
          logger.info(`Livestream '${title}' saved and stats updated.`);
          // Remove from FailedLivestreams if it exists
          await FailedLivestream.deleteOne({ videoId });
          return;
        }
      } else {
        throw new ApiError(`Livestream not found in YouTube API video.list for ${videoId}`, 500);
      }

      logger.info(`No Action taken for livestream ${videoId}`);
    } catch (error) {
      let errorMessage;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Unknown error type';
      }
      logger.error(`Failed to process livestream ${videoId}: ${errorMessage}`);
      // Save to FailedLivestreams
      await FailedLivestream.findOneAndUpdate(
        { videoId },
        {
          videoId,
          errorMessage,
          $inc: { retryCount: 1 },
          lastAttempt: new Date(),
        },
        { upsert: true }
      );
      throw error;
    }
  };


export const setupScheduler = (): void => {
  // PubSubHubbub subscription refresh (every 4 days)
  cron.schedule('0 0 */4 * *', async () => {
    await subscribeToChannel(config.youtubeChannelId, `${config.baseUrl}/api/webhooks/youtube`);
    logger.info('Refreshed PubSubHubbub subscription');
  }, { timezone: 'America/Chicago',  });

  // Retry failed livestreams (every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      const failed = await FailedLivestream.find({ retryCount: { $lt: config.maxRetries } }).limit(10); // Max 5 retries, process 10 at a time
      for (const entry of failed) {
        try {
          await processLivestream(entry.videoId);
        } catch (error) {
          // Error already logged and updated in processLivestream
          if (entry.retryCount + 1 >= config.maxRetries) {
            logger.warn(`Max retries reached for livestream ${entry.videoId}`);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Retry scheduler error: ${error.message}`, { error });
      } else {
        logger.error('Retry scheduler error: Unknown error type', { error });
      }
    }
  }, { timezone: 'America/Chicago' });

  // TODO: Implement midnight cron job to check for new livestreams using initialize.ts?
  // Code here...
};