import request from 'supertest';
import express from 'express';
import Livestream from '../../src/models/livestream';
import Stats from '../../src/models/stats';
import { handleInitialize, gracefulBulkInsert } from '../../src/controllers/initialize';
import youtube from '../../src/config/youtube';
import { ILivestream } from '../../src/types/livestream';
import { errorMiddleware } from '../../src/middleware/error';

jest.mock('../../src/utils/logger');
jest.mock('../../src/config/youtube');

describe('Initialize Controller', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.post('/api/initialize', handleInitialize);
    app.use(errorMiddleware)
    
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Livestream.deleteMany({});
    await Stats.deleteMany({});
  });

  it('should initialize with livestreams having actualStartTime', async () => {
    // Mock youtube.channels.list
    (youtube.channels.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UUxxxxxxxxxxxxxxxxxxxxxx',
              },
            },
          },
        ],
      },
    });

    // Mock youtube.playlistItems.list
    (youtube.playlistItems.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              resourceId: { videoId: 'vid1' },
              title: 'Livestream 1',
            },
          },
          {
            snippet: {
              resourceId: { videoId: 'vid1' }, // Duplicate
              title: 'Livestream 1',
            },
          },
          {
            snippet: {
              resourceId: { videoId: 'vid2' },
              title: 'Livestream 2',
            },
          },
        ],
        nextPageToken: undefined,
      },
    });

    // Mock youtube.videos.list
    (youtube.videos.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            id: 'vid1',
            snippet: { title: 'Livestream 1', publishedAt: '2025-04-28T09:00:00.000Z' },
            liveStreamingDetails: {
              scheduledStartTime: '2025-04-28T10:00:00.000Z',
              actualStartTime: '2025-04-28T10:05:00.000Z',
            },
          },
          {
            id: 'vid2',
            snippet: { title: 'Livestream 2', publishedAt: '2025-04-29T11:00:00.000Z' },
            liveStreamingDetails: {
              scheduledStartTime: '2025-04-29T12:00:00.000Z',
              actualStartTime: '2025-04-29T12:02:00.000Z',
            },
          },
        ],
      },
    });


    const response = await request(app).post('/api/initialize').send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Initialization complete',
      streamCount: 2,
      totalLateTime: 300 + 120, // 5min + 2min
    });

    const livestreams = await Livestream.find({});
    expect(livestreams).toHaveLength(2);
    expect(livestreams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            videoId: 'vid1',
            title: 'Livestream 1',
            lateTime: 300,
            scheduledStartTime: new Date('2025-04-28T10:00:00.000Z'),
            actualStartTime: new Date('2025-04-28T10:05:00.000Z'),
        }),
          expect.objectContaining({
            videoId: 'vid2',
            title: 'Livestream 2',
            lateTime: 120,
            scheduledStartTime: new Date('2025-04-29T12:00:00.000Z'),
            actualStartTime: new Date('2025-04-29T12:02:00.000Z'),
          }),
        ])
      );

    const stats = await Stats.findOne({});
    expect(stats).toMatchObject({
      streamCount: 2,
      totalLateTime: 420,
    });
  });

  it('should handle no uploads playlist', async () => {
    (youtube.channels.list as jest.Mock).mockResolvedValue({
      data: { items: [] },
    });
    const response = await request(app).post('/api/initialize').send({});

    expect(response.status).toBe(500);
    expect(response.body.error).toContain('No uploads playlist found');
  });

  it('should handle no livestreams with actualStartTime', async () => {
    (youtube.channels.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UUxxxxxxxxxxxxxxxxxxxxxx',
              },
            },
          },
        ],
      },
    });
    (youtube.playlistItems.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            snippet: {
              resourceId: { videoId: 'vid1' },
              title: 'Video 1',
            },
          },
        ],
        nextPageToken: undefined,
      },
    });
    (youtube.videos.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            id: 'vid1',
            snippet: { title: 'Video 1', publishedAt: '2025-04-28T09:00:00.000Z' },
            liveStreamingDetails: {
              scheduledStartTime: '2025-04-28T10:00:00.000Z',
              // No actualStartTime
            },
          },
        ],
      },
    });

    const response = await request(app).post('/api/initialize').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Initialization complete',
      streamCount: 0,
      totalLateTime: 0,
    });

    const livestreams = await Livestream.find({});
    expect(livestreams).toHaveLength(0);

    const stats = await Stats.findOne({});
    expect(stats).toMatchObject({
      streamCount: 0,
      totalLateTime: 0,
    });
  });

  it('should handle channel with no videos in uploads playlist', async () => {
    (youtube.channels.list as jest.Mock).mockResolvedValue({
      data: {
        items: [
          {
            contentDetails: {
              relatedPlaylists: {
                uploads: 'UUxxxxxxxxxxxxxxxxxxxxxx',
              },
            },
          },
        ],
      },
    });
    (youtube.playlistItems.list as jest.Mock).mockResolvedValue({
      data: {
        items: [],
        nextPageToken: undefined,
      },
    });

    const response = await request(app).post('/api/initialize').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Initialization complete',
      streamCount: 0,
      totalLateTime: 0,
    });

    const livestreams = await Livestream.find({});
    expect(livestreams).toHaveLength(0);

    const stats = await Stats.findOne({});
    expect(stats).toMatchObject({
      streamCount: 0,
      totalLateTime: 0,
    });
  });



  it('should handle API errors', async () => {
    (youtube.channels.list as jest.Mock).mockRejectedValue(new Error('Invalid API key'));
    const response = await request(app).post('/api/initialize').send({});
    expect(response.status).toBe(500);
    expect(response.body.error).toContain('Internal server error');
  });

  it('should handle duplicate keys in gracefulBulkInsert', async () => {
    const livestreams: ILivestream[] = [
      {
        videoId: 'vid1',
        title: 'Livestream 1',
        scheduledStartTime: new Date('2025-04-28T10:00:00.000Z'),
        actualStartTime: new Date('2025-04-28T10:05:00.000Z'),
        lateTime: 300,
      },
      {
        videoId: 'vid1', // Duplicate
        title: 'Livestream 1 Duplicate',
        scheduledStartTime: new Date('2025-04-28T10:00:00.000Z'),
        actualStartTime: new Date('2025-04-28T10:05:00.000Z'),
        lateTime: 300,
      },
    ];

    await gracefulBulkInsert(livestreams);

    const insertedLivestreams = await Livestream.find({});
    expect(insertedLivestreams).toHaveLength(1); // Only one should insert
    expect(insertedLivestreams[0]).toMatchObject({
      videoId: 'vid1',
      title: 'Livestream 1',
    });
  });
});