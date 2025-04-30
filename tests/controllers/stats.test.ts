import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import Stats from '../../src/models/stats';
import { getStats } from '../../src/controllers/stats';
import { errorMiddleware } from '../../src/middleware/error';

jest.mock('../../src/utils/logger');

describe('Stats Controller', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.get('/api/stats', getStats);
    app.use(errorMiddleware)
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Stats.deleteMany({});

  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('should return aggregated stats', async () => {
    await Stats.create({
      streamCount: 10,
      totalLateTime: 1200, // 1200 seconds
    });

    const response = await request(app).get('/api/stats');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      streamCount: 10,
      totalLateTime: 1200,
    });
  });

  it('should return default stats when none exist', async () => {
    const response = await request(app).get('/api/stats');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      streamCount: 0,
      totalLateTime: 0,
    });
  });

  it('should handle unexpected errors', async () => {
    // Mock Stats.findOne to throw an error
    jest.spyOn(Stats, 'findOne').mockRejectedValue(new Error('Database error'));
    const response = await request(app).get('/api/stats');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });
});