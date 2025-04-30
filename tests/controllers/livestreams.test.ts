import request from 'supertest';
import express from 'express';
import Livestream from '../../src/models/livestream';
import logger from '../../src/utils/logger';
import { getLivestreams } from '../../src/controllers/livestreams';
import { errorMiddleware } from '../../src/middleware/error';

jest.mock('../../src/utils/logger');

describe('Livestreams Controller', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.get('/api/livestreams', getLivestreams);
    app.get('/api/livestreams/:videoId', getLivestreams);
    app.use(errorMiddleware);

  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Livestream.deleteMany({});
  });


  it('should return livestreams with default skip and limit', async () => {

    const data = [
      {
        videoId: 'vid1',
        scheduledStartTime: '2025-04-28T10:00:00.000Z',
        actualStartTime: '2025-04-28T10:05:00.000Z',
        lateTime: 300,
        title: 'vid1 title'
      },
      {
        videoId: 'vid2',
        scheduledStartTime: '2025-04-28T12:00:00.000Z',
        actualStartTime: '2025-04-28T12:02:00.000Z',
        lateTime: 120,
        title: 'vid2 title'
      },
    ]

    await Livestream.create(data);

    const response = await request(app).get('/api/livestreams');

    expect(response.status).toBe(200);
    expect(response.body.livestreams).toHaveLength(2);
    expect(response.body.livestreams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          videoId: 'vid1',
          scheduledStartTime: '2025-04-28T10:00:00.000Z',
          actualStartTime: '2025-04-28T10:05:00.000Z',
          lateTime: 300,
          title: 'vid1 title'
        }),
        expect.objectContaining({
          videoId: 'vid2',
          scheduledStartTime: '2025-04-28T12:00:00.000Z',
          actualStartTime: '2025-04-28T12:02:00.000Z',
          lateTime: 120,
          title: 'vid2 title'
        }),
      ])
    );
    expect(response.body).toMatchObject({
      skip: 0,
      limit: 10,
      total: 2,
    });

  });

  it('should return livestreams with custom skip and limit', async () => {
    await Livestream.create(
      Array.from({ length: 12 }, (_, i) => ({
        videoId: `vid${i + 1}`,
        scheduledStartTime: '2025-04-28T10:00:00.000Z',
        actualStartTime: '2025-04-28T10:05:00.000Z',
        lateTime: 300,
        title: `vid${i + 1} title`,
      }))
    );

    const response = await request(app).get('/api/livestreams').query({ skip: 10, limit: 5 });

    const { skip, limit, total } = response.body;

    expect(response.status).toBe(200);
    expect(response.body.livestreams).toHaveLength(2);
    expect(skip).toBe(10);
    expect(limit).toBe(5);
    expect(total).toBe(12);
  });

  it('should return a single livestream by videoId', async () => {
    await Livestream.create({
      videoId: 'vid1',
      scheduledStartTime: '2025-04-28T10:00:00.000Z',
      actualStartTime: '2025-04-28T10:05:00.000Z',
      lateTime: 300,
      title: 'vid1 title',
    });

    const response = await request(app).get('/api/livestreams/vid1');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
        videoId: 'vid1',
        scheduledStartTime: '2025-04-28T10:00:00.000Z',
        actualStartTime: '2025-04-28T10:05:00.000Z',
        lateTime: 300,
        title: 'vid1 title',
    });
  });

  it('should return 404 for non-existent videoId', async () => {
    const response = await request(app).get('/api/livestreams/nonexistent');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Livestream not found' });
  });

  it('should return empty array for skip beyond total livestreams', async () => {
    await Livestream.create([
      { videoId: 'vid1', scheduledStartTime: '2025-04-28T10:00:00.000Z', actualStartTime: '2025-04-28T10:05:00.000Z', lateTime: 300, date: '2025-04-28' },
    ]);

    const response = await request(app).get('/api/livestreams').query({ skip: 10, limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body.livestreams).toEqual([]);
    expect(response.body).toMatchObject({
      skip: 10,
      limit: 5,
      total: 1,
    });
  });

  it('should return 400 for invalid skip parameter', async () => {
    const response = await request(app).get('/api/livestreams').query({ skip: '-1' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid skip parameter: must be a non-negative number',
    });
  });

  it('should return 400 for invalid limit parameter', async () => {
    const response = await request(app).get('/api/livestreams').query({ limit: '0' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Invalid limit parameter: must be a positive number',
    });

  });

  it('should return 500 for database errors', async () => {
    
    jest.spyOn(Livestream, 'find').mockRejectedValue(new Error('Database connection lost'));

    const response = await request(app).get('/api/livestreams').query({ skip: 0, limit: 10 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Database query failed: Database connection lost'
    });
  });
});