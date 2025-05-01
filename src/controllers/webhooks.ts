import { Request, Response } from 'express';
import crypto from 'crypto';
import { parseString } from 'xml2js';
import { config } from '../config/env';
import { ApiError } from '../utils/errors';
import logger from '../utils/logger';
import { processLivestream } from '../services/scheduler';

interface AtomFeed {
  feed: {
    entry?: Array<{
      'yt:videoId': string[];
      'yt:channelId': string[];
    }>;
  };
}

const verifySignature = (req: Request) => {
  try {
    logger.debug('Verifying signature for webhook request', { headers: req.headers });
    const signature = req.headers['x-hub-signature'] as string;
    if (!signature) {
      logger.warn('Missing X-Hub-Signature header');
      return false;
    }
    const hmac = crypto.createHmac('sha1', config.webhookSecret);
    hmac.update(req.body);
    const computed = `sha1=${hmac.digest('hex')}`;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  } catch (error) {
    const errorMessage = error instanceof Error ? `An unexpected error was thrown while verifying signature: ${error.message}` : 'Unknown error in signature verification';
    logger.error(errorMessage);
    throw new ApiError(errorMessage, 500);
  }
};





export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'] as string;
    const mode = req.query['hub.mode'] as string;
    const topic = req.query['hub.topic'] as string;
    if (challenge && topic && mode === 'subscribe') {
      res.status(200).send(challenge);
    } else {
      throw new ApiError('Invalid verification request', 400);
    }
    return;
  }

  if (req.method === 'POST') {
  
    if (!verifySignature(req)) {
      logger.warn('Invalid signature in webhook request', { headers: req.headers });
      throw new ApiError('Invalid signature', 403);
    }

    try {
      const result: AtomFeed = await new Promise((resolve, reject) => {
        parseString(req.body, (err, parsed) => {
          if (err) {
            console.log('Error parsing XML:', err);
            reject(new ApiError('Invalid XML', 400));
          } else {
            resolve(parsed);
          }
        });
      });

      // Send 204 immediately to acknowledge receipt
      res.status(204).send();

      // Process the notification asynchronously
      const entry = result.feed.entry?.[0];
      if (entry) {
        const videoId = entry['yt:videoId']?.[0];
        await processLivestream(videoId);
      }
    } catch (error) {
      // Log error but don't send another response, unless Invalid XML
      if (error instanceof ApiError) {
        logger.warn(`Webhook error: ${error.message}`, { status: error.status, details: error.details });
        if (error.message === 'Invalid XML') {
          throw error; // Re-throw to trigger error middleware
        }
      } else {
        if (error instanceof Error) {
          logger.error(`Unexpected webhook error: ${error.message}`, { stack: error.stack });
        } else {
          logger.error('Unexpected webhook error of unknown type', { error });
        }
      }
    }
  }
};