import logger from '../utils/logger';
import { config } from '../config/env';

// TODO: Review this code

export const subscribeToChannel = async (channelId: string, callbackUrl: string): Promise<void> => {
  const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe';
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
  logger.debug(`Subscribing to channel ${channelId} with callback URL ${callbackUrl}`);
  const params = {
    'hub.mode': 'subscribe',
    'hub.topic': topicUrl,
    'hub.callback': callbackUrl,
    'hub.verify': 'sync',
    'hub.secret': config.webhookSecret || 'your-secret-key',
  };
  const formBody = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  try {
    const response = await fetch(hubUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });
    if (response.status === 204) {
      logger.info(`Subscribed to channel ${channelId}`);
    } else {
      logger.error(`Subscription failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    logger.error(`Subscription error: ${(error as Error).message}`);
  }
};


