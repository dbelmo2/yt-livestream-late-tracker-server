import request from 'supertest';
import express from 'express';
import { handleWebhook } from '../../src/controllers/webhooks';
import { FailedLivestream } from '../../src/models/failedLivestreams';
import Livestream from '../../src/models/livestream';
import Stats from '../../src/models/stats';
import youtube from '../../src/config/youtube';
import crypto from 'crypto';
import { config } from '../../src/config/env';
import { errorMiddleware } from '../../src/middleware/error';
jest.mock('../../src/config/youtube');
jest.mock('../../src/utils/logger');

describe('Webhook Controller', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.text({ type: 'application/xml' }));
    app.post('/api/webhooks/youtube', handleWebhook);
    app.get('/api/webhooks/youtube', handleWebhook);
    app.use(errorMiddleware)

  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Livestream.deleteMany({});
  });


  afterEach(async () =>  {
    await FailedLivestream.deleteMany({});
    await Livestream.deleteMany({});
    await Stats.deleteMany({});
    jest.clearAllMocks();
  });

  it('should return challenge for valid GET subscription verification', async () => {
    const response = await request(app)
      .get('/api/webhooks/youtube')
      .query({
        'hub.challenge': 'challenge123',
        'hub.mode': 'subscribe',
        'hub.topic': 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID',
      });
    expect(response.status).toBe(200);
    expect(response.text).toBe('challenge123');
  });

  it('should return 400 for invalid GET verification', async () => {
    const response = await request(app)
      .get('/api/webhooks/youtube')
      .query({ 'hub.mode': 'subscribe' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid verification request' });
  });

  it('should return 403 for POST with invalid signature', async () => {
    const payload = '<?xml version="1.0"?><feed><entry><yt:videoId>abc123</yt:videoId></entry></feed>';
    const wrongSecret = 'wrong-secret-key';
    const signature = `sha1=${crypto
      .createHmac('sha1', wrongSecret)
      .update(payload)
      .digest('hex')}`;
    const response = await request(app)
      .post('/api/webhooks/youtube')
      .set('Content-Type', 'application/xml')
      .set('X-Hub-Signature', signature)
      .send(payload);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Invalid signature' });
  });

  it('should return 204 and process valid XML POST', async () => {
    const payload = '<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>abc123</yt:videoId></entry></feed>';
    const signature = `sha1=${crypto
      .createHmac('sha1', config.webhookSecret)
      .update(payload)
      .digest('hex')}`;
    (youtube.videos.list as jest.Mock).mockResolvedValue({
      data: {
        items: [{
          snippet: { liveBroadcastContent: 'live' },
          liveStreamingDetails: {
            scheduledStartTime: '2025-04-27T10:00:00Z',
            actualStartTime: '2025-04-27T10:05:00Z',
          },
        }],
      },
    });

    const response = await request(app)
      .post('/api/webhooks/youtube')
      .set('Content-Type', 'application/xml')
      .set('X-Hub-Signature', signature)
      .send(payload);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    const livestream = await Livestream.findOne({ videoId: 'abc123' });
    expect(livestream).toBeTruthy();
    console.log(livestream, 'livestream failing test');
    expect(livestream?.lateTime).toBe(300); // 5 minutes late
    const stats = await Stats.findOne({});
    expect(stats?.totalLateTime).toBe(300);
    expect(stats?.streamCount).toBe(1);
  });

  it('should return 400 for POST with invalid XML', async () => {
    const payload = '<invalid';
    const signature = `sha1=${crypto
      .createHmac('sha1', config.webhookSecret)
      .update(payload)
      .digest('hex')}`;

    const response = await request(app)
      .post('/api/webhooks/youtube')
      .set('Content-Type', 'application/xml')
      .set('X-Hub-Signature', signature)
      .send(payload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid XML' });
    
  });

  it('should return 204 and save to FailedLivestreams for YouTube API error', async () => {
    const payload = '<?xml version="1.0"?><feed><entry><yt:videoId>abc123</yt:videoId></entry></feed>';
    const signature = `sha1=${crypto
      .createHmac('sha1', config.webhookSecret)
      .update(payload)
      .digest('hex')}`;
    (youtube.videos.list as jest.Mock).mockRejectedValue(new Error('Quota exceeded'));

    const response = await request(app)
      .post('/api/webhooks/youtube')
      .set('Content-Type', 'application/xml')
      .set('X-Hub-Signature', signature)
      .send(payload);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    const failed = await FailedLivestream.findOne({ videoId: 'abc123' });
    expect(failed).toBeTruthy();
    expect(failed?.errorMessage).toBe('Quota exceeded');
    expect(failed?.retryCount).toBe(1);
  });
});