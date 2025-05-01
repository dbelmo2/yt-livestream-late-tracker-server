import { setupScheduler, processLivestream } from '../../src/services/scheduler';
import { FailedLivestream } from '../../src/models/failedLivestreams';
import Livestream from '../../src/models/livestream';
import Stats from '../../src/models/stats';
import youtube from '../../src/config/youtube';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { config } from '../../src/config/env';
import logger from '../../src/utils/logger';

jest.mock('../../src/config/youtube');
jest.mock('../../src/utils/logger');
jest.mock('node-cron');

describe('Scheduler', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await Livestream.deleteMany({});
  });

  it('should save failed livestream to FailedLivestreams on API error', async () => {
    (youtube.videos.list as jest.Mock).mockRejectedValue(new Error('Quota exceeded'));
    await expect(processLivestream('test123')).rejects.toThrow('Quota exceeded');
    const failed = await FailedLivestream.findOne({ videoId: 'test123' });
    expect(failed).toBeTruthy();
    expect(failed?.errorMessage).toBe('Quota exceeded');
    expect(failed?.retryCount).toBe(1);
  });

  it('should process livestream and remove from FailedLivestreams on successful retry', async () => {
    (youtube.videos.list as jest.Mock).mockResolvedValue({
      data: {
        items: [{
          snippet: { liveBroadcastContent: 'live' },
          liveStreamingDetails: {
            scheduledStartTime: '2025-04-27T10:00:00.000Z',
            actualStartTime: '2025-04-27T10:05:00.000Z',
          },
        }],
      },
    });
    await FailedLivestream.create({ videoId: 'test123', errorMessage: 'Previous failure', retryCount: 1 });
    await processLivestream('test123');
    const livestream = await Livestream.findOne({ videoId: 'test123' });
    expect(livestream).toBeTruthy();
    expect(livestream?.lateTime).toBe(300); // 5 minutes late
    const failed = await FailedLivestream.findOne({ videoId: 'test123' });
    expect(failed).toBeNull();
    const stats = await Stats.findOne({});
    expect(stats?.totalLateTime).toBe(300);
    expect(stats?.streamCount).toBe(1);
  });

  it(`should limit retries to ${config.maxRetries} and log warning`, async () => {
    (youtube.videos.list as jest.Mock).mockRejectedValue(new Error('Quota exceeded'));
    await FailedLivestream.create({ videoId: 'test123', errorMessage: 'Initial failure', retryCount: 4 });
    try {
        await processLivestream('test123');
      } catch (error) {
        let errorMessage;
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        expect(errorMessage).toBe('Quota exceeded');
      }    
    const failed = await FailedLivestream.findOne({ videoId: 'test123' });
    expect(failed?.retryCount).toBe(config.maxRetries); // Should not exceed max retries
  });

  it('should schedule cron jobs on setup', async () => {
    setupScheduler();
    expect(cron.schedule).toHaveBeenCalledTimes(2); // Subscription, polling, retry
    expect(cron.schedule).toHaveBeenCalledWith('0 0 */4 * *', expect.any(Function), expect.any(Object));
    expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function), expect.any(Object));
  });


  it('should handle polling errors gracefully', async () => {
    (youtube.search.list as jest.Mock).mockRejectedValue(new Error('API error'));
    setupScheduler(); // Ensure scheduler is set up
    const pollingJob = (cron.schedule as jest.Mock).mock.calls[1][1];
    await pollingJob();
    expect(await Livestream.countDocuments()).toBe(0);
  });

  it('Should update only the title if the livestream is already in the Livestream collection', async () => {
    (youtube.videos.list as jest.Mock).mockResolvedValue({
      data: {
        items: [{
          snippet: { title: 'Updated Title', liveBroadcastContent: 'live' },
          liveStreamingDetails: {
            scheduledStartTime: '2025-04-27T10:00:00.000Z',
            actualStartTime: '2025-04-27T10:05:00.000Z',
          },
        }],
      },
    });
    await Livestream.create({
      videoId: 'test123',
      scheduledStartTime: '2025-04-27T10:00:00.000Z',
      actualStartTime: '2025-04-27T10:05:00.000Z',
      lateTime: 300,
      title: 'Old Title',
    });
    await processLivestream('test123');
    const livestream = await Livestream.findOne({ videoId: 'test123' });
    expect(livestream?.title).toBe('Updated Title');
    expect(livestream?.lateTime).toBe(300); // Should not change lateTime
    const scheduleTimeUnchanged = livestream?.scheduledStartTime?.getTime() === new Date('2025-04-27T10:00:00.000Z').getTime();
    expect(scheduleTimeUnchanged).toBeTruthy(); // Should not change scheduledStartTime
    const actualStartTimeUnchanged = livestream?.actualStartTime?.getTime() === new Date('2025-04-27T10:05:00.000Z').getTime();
    expect(actualStartTimeUnchanged).toBeTruthy(); // Should not change actualStartTime

  });
});