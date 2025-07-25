import cron from 'node-cron';
import { subscribeToChannel } from './youtube';
import { config } from '../config/env';
import logger from '../utils/logger';
import youtube from '../config/youtube';
import Livestream from '../models/livestream';
import Stats from '../models/stats';
import { calculateLateTime, formatDuration } from '../utils/time';
import { FailedLivestream } from '../models/failedLivestreams';
import { ApiError } from '../utils/errors';
import { ILivestream } from '../types/livestream';

// TODO: Handle duplicate key MongoDB error after a livestream goes live. 
// These errors should be handled gracefully by simply logging a warning and NOT inserting into the failedLivestreams collection
// Because the duplicate comes almost immediately after the valid livestream, the check below does not work... 


// This function is used to process both failed and new livestreams. 
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
          logger.info(`Calculated late time for livestream ${videoId}: ${lateTime}s or ${formatDuration(lateTime)}`);
          const title = livestream?.snippet?.title || 'No title available';

          const livestreamDocument = {
            videoId,
            scheduledStartTime,
            actualStartTime,
            lateTime,
            title,
          };
          
          // Save the livestream document
          await Livestream.create(livestreamDocument);
          await updateStats([livestreamDocument as unknown as ILivestream]);

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


export const updateStats = async (liveStreamDocuments: ILivestream[]): Promise<typeof Stats.prototype> => {

  if (liveStreamDocuments.length === 0) {
    // TODO: Recalculate stats based on existing documents???
    return
  }

  let currentStats = await Stats.findOne({});


  
  if (!currentStats) {
    // Create new stats document if it doesn't exist
    currentStats = new Stats({
      streamCount: 0,
      totalLateTime: 0,
      averageLateTime: 0,
      maxLateTime: 0,
      daily: {
        sunday: { totalLateTime: 0, count: 0 },
        monday: { totalLateTime: 0, count: 0 },
        tuesday: { totalLateTime: 0, count: 0 },
        wednesday: { totalLateTime: 0, count: 0 },
        thursday: { totalLateTime: 0, count: 0 },
        friday: { totalLateTime: 0, count: 0 },
        saturday: { totalLateTime: 0, count: 0 },
      },
    });

    await currentStats.save();
  }

  const newStreamCount = (currentStats.streamCount) + liveStreamDocuments.length;
  const newTotalLateTime = (currentStats.totalLateTime) + liveStreamDocuments.reduce((acc, doc) => acc + doc.lateTime, 0);
  const newAverageLateTime = newTotalLateTime / newStreamCount;
  const newMaxLateTime = Math.max(currentStats.maxLateTime, ...liveStreamDocuments.map(doc => doc.lateTime));

  const newDailyData = {
    sunday: { totalLateTime: 0, count: 0 },
    monday: { totalLateTime: 0, count: 0 },
    tuesday: { totalLateTime: 0, count: 0 },
    wednesday: { totalLateTime: 0, count: 0 },
    thursday: { totalLateTime: 0, count: 0 },
    friday: { totalLateTime: 0, count: 0 },
    saturday: { totalLateTime: 0, count: 0 },
  }

  for (const doc of liveStreamDocuments) {
    const scheduledDate = new Date(doc.scheduledStartTime);
    const dayOfWeek = scheduledDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    newDailyData[dayName as keyof typeof newDailyData].totalLateTime += doc.lateTime;
    newDailyData[dayName as keyof typeof newDailyData].count += 1;
  }



  const updatedStats = await Stats.updateOne(
    {},
    {
      $set: {
        streamCount: newStreamCount,
        totalLateTime: newTotalLateTime,
        averageLateTime: newAverageLateTime,
        maxLateTime: newMaxLateTime,
        lastUpdateDate: new Date(),
        daily: {
          sunday: {
            totalLateTime: currentStats.daily.sunday.totalLateTime + newDailyData.sunday.totalLateTime,
            count: currentStats.daily.sunday.count + newDailyData.sunday.count
          },
          monday: {
            totalLateTime: currentStats.daily.monday.totalLateTime + newDailyData.monday.totalLateTime,
            count: currentStats.daily.monday.count + newDailyData.monday.count
          },
          tuesday: {
            totalLateTime: currentStats.daily.tuesday.totalLateTime + newDailyData.tuesday.totalLateTime,
            count: currentStats.daily.tuesday.count + newDailyData.tuesday.count
          },
          wednesday: {
            totalLateTime: currentStats.daily.wednesday.totalLateTime + newDailyData.wednesday.totalLateTime,
            count: currentStats.daily.wednesday.count + newDailyData.wednesday.count
          },
          thursday: {
            totalLateTime: currentStats.daily.thursday.totalLateTime + newDailyData.thursday.totalLateTime,
            count: currentStats.daily.thursday.count + newDailyData.thursday.count
          },
          friday: {
            totalLateTime: currentStats.daily.friday.totalLateTime + newDailyData.friday.totalLateTime,
            count: currentStats.daily.friday.count + newDailyData.friday.count
          },
          saturday: {
            totalLateTime: currentStats.daily.saturday.totalLateTime + newDailyData.saturday.totalLateTime,
            count: currentStats.daily.saturday.count + newDailyData.saturday.count
          },
        }
      }
    },
    { upsert: true, new: true }
  );

  logger.info(`Updated stats: ${JSON.stringify(updatedStats)}`);
  return updatedStats;
}


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