import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import routes from './routes/index';
import logger from './utils/logger';
import connectDB from './config/database';
import { errorMiddleware } from './middleware/error';
import { rateLimiter } from './middleware/rateLimit';
import { config } from './config/env';
import { setupScheduler } from './services/scheduler';
import { subscribeToChannel } from './services/youtube';
import MatchMaker, { Region } from './services/MatchMaker';

connectDB();

const app = express();
const server = http.createServer(app); // 🔄 create HTTP server for Socket.IO to attach to

const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // adjust for production
    methods: ['GET', 'POST']
  }
});

app.set('trust proxy', 1);
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.text({ type: 'application/atom+xml' }));
app.use(errorMiddleware);

// ✅ Rate limiting (except /webhooks)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/webhooks')) return next();
  return rateLimiter(req, res, next);
});

app.use('/api', routes);

// ✅ Socket.IO Matchmaking
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('joinQueue', (region: string) => {
    logger.info(`Socket ${socket.id} emitted joinQueue`);
    logger.info('')
    if (['NA', 'EU', 'ASIA'].includes(region)) {
      logger.info(`Valid region: ${region}, queuing player`);
      MatchMaker.enqueuePlayer({
        id: socket.id,
        socket,
        region: region as Region,
        enqueuedAt: Date.now()
      });
      socket.emit('queued', { region });
    } else {

      socket.emit('error', { message: 'Invalid region' });
    }
    socket.emit('queued', { region });
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    // You can notify matchmaker if needed
  });
});

const PORT = config.port || 3000;
server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

/*
(async () => {
  logger.info('Subscribing to YouTube channel...');
  await subscribeToChannel(
    config.youtubeChannelId,
    `${config.baseUrl}/api/webhooks/youtube`
  );
  setupScheduler();
})();
*/