import cron from 'node-cron';
import { subscribeToChannel } from './youtube';
import { config } from '../config/env';
import logger from '../utils/logger';
import youtube from '../config/youtube';
import Livestream from '../models/livestream';
import Stats from '../models/stats';
import { FailedLivestream } from '../models/FailedLivestreams';
import { calculateLateTime } from '../utils/time';



// TODO: Check if this can be replaced with the already existing function in the webhook controller
export const processLivestream = async (videoId: string): Promise<void> => {
    try {
      const response = await youtube.videos.list({
        part: ['snippet,liveStreamingDetails'],
        id: [videoId],
      });
      const livestream = response?.data?.items?.[0] ?? null;
      if (livestream && livestream?.snippet?.liveBroadcastContent !== 'none') {
        const { scheduledStartTime, actualStartTime } = livestream.liveStreamingDetails || {};
        if (!scheduledStartTime || !actualStartTime) {
          logger.warn(`Missing start times for livestream ${videoId}. Skipping.`);
          return;
        }
        const lateTime = calculateLateTime(scheduledStartTime, actualStartTime);
        const title = livestream?.snippet?.title || 'No title available';
        await Livestream.create({
          videoId,
          scheduledStartTime,
          actualStartTime,
          lateTime,
          title,
        });
        await Stats.updateOne(
          {},
          { $inc: { totalLateTime: lateTime, streamCount: 1 } },
          { upsert: true }
        );
        logger.info(`Processed livestream ${videoId}`);
        // Remove from FailedLivestreams if it exists
        await FailedLivestream.deleteOne({ videoId });
      }
    } catch (error) {
      let errorMessage;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else {
        errorMessage = 'Unknown error type';
      }
      logger.error(`Failed to process livestream ${videoId}: ${errorMessage}`, { error });
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


// TODO: Fix various errors below
export const setupScheduler = (): void => {
  // PubSubHubbub subscription refresh (every 4 days)
  cron.schedule('0 0 */4 * *', () => {
    subscribeToChannel('YOUR_CHANNEL_ID', `${config.baseUrl}/webhooks/youtube`);
    logger.info('Refreshed PubSubHubbub subscription');
  }, { timezone: 'America/Chicago' });

  // Fallback polling for missed livestreams (daily at 2pm CST)
  cron.schedule('0 14 * * *', async () => {
    try {
      const response = await youtube.search.list({
        part: ['snippet'],
        channelId: 'YOUR_CHANNEL_ID',
        eventType: 'completed',
        type: 'video',
        maxResults: 50,
      });
      const videoIds = response.data.items.map((item) => item.id.videoId);
      for (const videoId of videoIds) {
        const existing = await Livestream.findOne({ videoId });
        if (!existing) {
          await processLivestream(videoId);
        }
      }
    } catch (error) {
      logger.error(`Polling error: ${error.message}`, { error });
    }
  }, { timezone: 'America/Chicago' });

  // Retry failed livestreams (every hour)
  cron.schedule('0 * * * *', async () => {
    try {
      const failed = await FailedLivestream.find({ retryCount: { $lt: 3 } }).limit(10); // Max 5 retries, process 10 at a time
      for (const entry of failed) {
        try {
          await processLivestream(entry.videoId);
        } catch (error) {
          // Error already logged and updated in processLivestream
          if (entry.retryCount + 1 >= 3) {
            logger.warn(`Max retries reached for livestream ${entry.videoId}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Retry scheduler error: ${error.message}`, { error });
    }
  }, { timezone: 'America/Chicago' });
};