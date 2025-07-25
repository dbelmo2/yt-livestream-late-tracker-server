import * as dotenv from 'dotenv';
dotenv.config();

// Keep this as server for webpage for checking how late a channel has been. This will still handle the database layer and use it to avoid rate limits.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';

import routes from './routes/index';
import logger from './utils/logger';
import connectDB from './config/database';
import { errorMiddleware } from './middleware/error';
import { rateLimiter } from './middleware/rateLimit';
import { config } from './config/env';
import { setupScheduler } from './services/scheduler';
import { subscribeToChannel } from './services/youtube';

connectDB();

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.text({ type: 'application/atom+xml' }));
app.use(errorMiddleware);

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  return rateLimiter(req, res, next);
});

app.use('/api', routes);


const PORT = config.port || 3000;
server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});


(async () => {
  logger.info('Subscribing to YouTube channel...');
  await subscribeToChannel(
    config.youtubeChannelId,
    `${config.baseUrl}/api/webhooks/youtube`
  );
  setupScheduler();
})();
