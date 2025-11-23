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
import dayjs from 'dayjs';
import { informGameShowIsLive } from './game';

const MIN_RETRY_WAIT_HOURS = 3; // Minimum wait time before retrying a failed livestream

// TODO: Fix scenario from happening:
// Fix situation where the livestream from webhook was successfully processed,
// but the hook then gets triggered again "title change"? This seems to have happened and thrown a duplicate key error. 
export const processLivestream = async (videoId: string, isFromWebhook = false): Promise<void> => {
    try {
      logger.info(`Processing livestream with videoId: ${videoId}`);
      const response = await youtube.videos.list({
        part: ['snippet,liveStreamingDetails,status'],
        id: [videoId],
      });

      const livestream = response?.data?.items?.[0] ?? null;
      logger.info(`Livestream data from video list API: ${JSON.stringify(livestream)}`);

      if (livestream?.status?.uploadStatus === 'processed') {
        logger.warn(`Livestream ${videoId} has uploadStatus 'processed'. This is likely a video premiere. Skipping processing.`);
        return;
      }
      const title = livestream?.snippet?.title || 'Unknown title';


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
            logger.warn(`Missing start times for livestream ${videoId} (${title}). Checking if already present in FailedLivestreams...`);
            const existingFailed = await FailedLivestream.findOne({ videoId });
            if (existingFailed) {
              logger.info(`Livestream ${videoId} found in FailedLivestreams, not adding again. (This was likely caused by a change to the livestream while in scheduled status)`);
              return;
            }
            await FailedLivestream.create({
              videoId,  
              errorMessage: 'Missing scheduled or actual start time',
              retryCount: 0,
              lastAttempt: new Date(),
              createdAt: new Date(),
            });
            return;
          }


          if (isFromWebhook) {
            // TODO: Move this to only happen if we have actual start time
            const actualStartTime = livestream?.liveStreamingDetails?.actualStartTime;
            if (actualStartTime) {
              await informGameShowIsLive(videoId, title);
            }
          }


          const lateTime = calculateLateTime(scheduledStartTime, actualStartTime);
          logger.info(`Calculated late time for livestream ${videoId} (${title}): ${lateTime}s or ${formatDuration(lateTime)}`);

          const livestreamDocument = {
            videoId,
            scheduledStartTime,
            actualStartTime,
            lateTime,
            title,
          };
          await Livestream.create(livestreamDocument);
          await updateStats([livestreamDocument as unknown as ILivestream]);

          // Remove from FailedLivestreams if it exists
          await FailedLivestream.deleteOne({ videoId });
          logger.info(`Successfully processed livestream ${videoId} (${title}), removed from failed collection if it existed`);
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


export const updateStats = async (liveStreamDocuments: ILivestream[]): Promise<void> => {
  logger.info(`Starting updateStats with ${liveStreamDocuments.length} livestream documents`);

  if (liveStreamDocuments.length === 0) {
    logger.info('No livestream documents to process, returning early');
    return;
  }

  let currentStats = await Stats.findOne({});
  logger.info(`Current stats found: ${currentStats ? 'Yes' : 'No'}`);

  if (!currentStats) {
    logger.info('No existing stats found, creating new stats document');
    // Create new stats document if it doesn't exist
    // Use the first livestream as initial values
    const firstLivestream = liveStreamDocuments[0];
    logger.info(`Initializing stats with first livestream: ${firstLivestream.title} (${firstLivestream.videoId})`);
    currentStats = new Stats({
      streamCount: 0,
      totalLateTime: 0,
      averageLateTime: 0,
      max: {
        videoId: firstLivestream.videoId,
        lateTime: firstLivestream.lateTime,
        title: firstLivestream.title,
      },
      mostRecent: {
        videoId: firstLivestream.videoId,
        lateTime: firstLivestream.lateTime,
        title: firstLivestream.title,
        actualStartTime: firstLivestream.actualStartTime,
        scheduledStartTime: firstLivestream.scheduledStartTime,
      },
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
    logger.info('New stats document created and saved successfully');
  }

  const newStreamCount = (currentStats.streamCount) + liveStreamDocuments.length;
  const newTotalLateTime = (currentStats.totalLateTime) + liveStreamDocuments.reduce((acc, doc) => acc + doc.lateTime, 0);
  const newAverageLateTime = newTotalLateTime / newStreamCount;

  logger.info(`Stats calculation: streamCount ${currentStats.streamCount} -> ${newStreamCount}`);
  logger.info(`Stats calculation: totalLateTime ${currentStats.totalLateTime} -> ${newTotalLateTime}`);
  logger.info(`Stats calculation: averageLateTime ${currentStats.averageLateTime} -> ${newAverageLateTime}`);


  const newDailyData = {
    sunday: { totalLateTime: 0, count: 0 },
    monday: { totalLateTime: 0, count: 0 },
    tuesday: { totalLateTime: 0, count: 0 },
    wednesday: { totalLateTime: 0, count: 0 },
    thursday: { totalLateTime: 0, count: 0 },
    friday: { totalLateTime: 0, count: 0 },
    saturday: { totalLateTime: 0, count: 0 },
  }

  // Initialize with index 0 (this is updated in the loop with correct values)
  let mostLateNewDoc = liveStreamDocuments[0];
  let newestStream = liveStreamDocuments[0];
  
  logger.info(`Processing ${liveStreamDocuments.length} livestreams for daily stats and finding most late/newest`);
  
  for (const doc of liveStreamDocuments) {
    logger.info(`Update states. Processing livestream: ${JSON.stringify(doc)}`);
    
    const scheduledDate = new Date(doc.scheduledStartTime);
    const dayOfWeek = scheduledDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    newDailyData[dayName as keyof typeof newDailyData].totalLateTime += doc.lateTime;
    newDailyData[dayName as keyof typeof newDailyData].count += 1;

    if (doc.lateTime > mostLateNewDoc.lateTime) {
      logger.debug(`Found new most late stream: ${doc.title} (${doc.lateTime}s) replacing ${mostLateNewDoc.title} (${mostLateNewDoc.lateTime}s)`);
      mostLateNewDoc = doc;
    }

    if (doc.actualStartTime > newestStream.actualStartTime) {
      logger.debug(`Found newer stream: ${doc.title} (${doc.actualStartTime}) replacing ${newestStream.title} (${newestStream.actualStartTime})`);
      newestStream = doc;
    }
  }

  logger.info(`Most late new document: ${mostLateNewDoc.title} (${mostLateNewDoc.lateTime}s)`);
  logger.info(`Newest stream: ${newestStream.title} (${newestStream.actualStartTime})`);


  const maxUpdateData = {
    videoId: currentStats.max.videoId,
    lateTime: currentStats.max.lateTime,
    title: currentStats.max.title,
  }

  if (mostLateNewDoc.lateTime > maxUpdateData.lateTime) {
    logger.info(`Updating max from ${maxUpdateData.title} (${maxUpdateData.lateTime}s) to ${mostLateNewDoc.title} (${mostLateNewDoc.lateTime}s)`);
    maxUpdateData.lateTime = mostLateNewDoc.lateTime;
    maxUpdateData.videoId = mostLateNewDoc.videoId;
    maxUpdateData.title = mostLateNewDoc.title;
  } else {
    logger.info(`Keeping current max: ${maxUpdateData.title} (${maxUpdateData.lateTime}s) - no new higher late time found`);
  }


  const mostRecentUpdateData = {
    videoId: currentStats.mostRecent.videoId,
    lateTime: currentStats.mostRecent.lateTime,
    title: currentStats.mostRecent.title,
    actualStartTime: currentStats.mostRecent.actualStartTime,
    scheduledStartTime: currentStats.mostRecent.scheduledStartTime,
  }

  // Find the most recent stream from the database to compare with new streams
  const currentMostRecent = await Livestream.findOne({ videoId: currentStats.mostRecent.videoId });
  const currentMostRecentDate = new Date(currentMostRecent?.actualStartTime || 0);

  logger.info(`Current mostRecent: ${currentStats.mostRecent.title} (${currentMostRecentDate})`);
  logger.info(`Newest incoming stream: ${newestStream.title} (${newestStream.actualStartTime})`);

  // Always update mostRecent to the newest stream by actualStartTime, regardless of late time
  if (new Date(newestStream.actualStartTime) > currentMostRecentDate) {
    logger.info(`Updating mostRecent from ${currentStats.mostRecent.title} to ${newestStream.title}`);
    mostRecentUpdateData.lateTime = newestStream.lateTime;
    mostRecentUpdateData.videoId = newestStream.videoId;
    mostRecentUpdateData.title = newestStream.title;
    mostRecentUpdateData.actualStartTime = newestStream.actualStartTime;
    mostRecentUpdateData.scheduledStartTime = newestStream.scheduledStartTime;
  } else {
    logger.info(`Keeping current mostRecent: ${currentStats.mostRecent.title} (newer than incoming streams)`);
  }

  // Log daily stats updates
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  dayNames.forEach(day => {
    if (newDailyData[day as keyof typeof newDailyData].count > 0) {
      logger.info(`Daily stats for ${day}: adding ${newDailyData[day as keyof typeof newDailyData].count} streams with ${newDailyData[day as keyof typeof newDailyData].totalLateTime}s total late time`);
    }
  });

  logger.info('Saving updated stats to database...');

  await Stats.updateOne(
    {},
    {
      $set: {
        streamCount: newStreamCount,
        totalLateTime: newTotalLateTime,
        averageLateTime: newAverageLateTime,
        max: maxUpdateData,
        mostRecent: mostRecentUpdateData,
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
    { upsert: true }
  );

  logger.info(`Stats update completed successfully. Final counts - streams: ${newStreamCount}, total late time: ${newTotalLateTime}s, average: ${newAverageLateTime.toFixed(2)}s`);
}


export const generateStats = async (): Promise<typeof Stats.prototype> => {
    logger.info('Generating stats from existing livestream data');
    let currentPage = 1;
    const pageSize = 100;
    let hasMoreData = true;
    let allLivestreams: ILivestream[] = [];
    try {
      // Paginate through all livestreams
      while (hasMoreData) {
        const livestreams = await Livestream.find({})
          .sort({ scheduledStartTime: 1 })
          .skip((currentPage - 1) * pageSize)
          .limit(pageSize)
          .lean();
        
        if (livestreams.length === 0) {
          hasMoreData = false;
        } else {
          // Convert lean objects to ILivestream compatible objects
          const typedLivestreams = livestreams.map(ls => ({
            videoId: ls.videoId,
            title: ls.title || '',
            lateTime: ls.lateTime || 0,
            scheduledStartTime: new Date(ls.scheduledStartTime as Date),
            actualStartTime: new Date(ls.actualStartTime as Date)
          } as ILivestream));
          
          allLivestreams = [...allLivestreams, ...typedLivestreams];
          currentPage++;
        }
      }
      
      logger.info(`Found ${allLivestreams.length} livestreams for stats generation`);
      
      if (allLivestreams.length === 0) {
        logger.warn('No livestreams found to generate stats');
        return;
      }
      
      // Delete existing stats to recreate from scratch
      await Stats.deleteMany({});
      
      // Update stats with all livestreams
      await updateStats(allLivestreams);
      logger.info('Successfully regenerated stats from existing livestream data');
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to generate stats: ${error.message}`, { error });
      } else {
        logger.error('Failed to generate stats: Unknown error', { error });
      }
      throw error;
    }
  
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
      
      const failed = await FailedLivestream.find({ 
        retryCount: { $lt: config.maxRetries }, 
        createdAt: { $lte: dayjs().subtract(MIN_RETRY_WAIT_HOURS, 'hour').toDate() } // Only retry failed livestreams created at least MIN_RETRY_WAIT_HOURS ago
      }).limit(10); // Max 5 retries, process 10 at a time

      logger.info(`Found ${failed.length} failed livestreams eligible for retry (older than ${MIN_RETRY_WAIT_HOURS} hours)`);

      for (const entry of failed) {
        try {
          // Check if livestream already exists (scenario 1 happened)
          const existingLivestream = await Livestream.findOne({ videoId: entry.videoId });
          if (existingLivestream) {
            logger.info(`Livestream ${entry.videoId} already exists in collection. Removing from failed collection.`);
            await FailedLivestream.deleteOne({ videoId: entry.videoId });
            continue;
          }
          
          logger.info(`Retrying failed livestream ${entry.videoId} (attempt ${entry.retryCount + 1}/${config.maxRetries})`);
          await processLivestream(entry.videoId);
        } catch (error) {
          // Error already logged and updated in processLivestream
          if (entry.retryCount + 1 >= config.maxRetries) {
            logger.warn(`Max retries reached for livestream ${entry.videoId}. Giving up.`);
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