import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import routes from './routes/index'; 
import logger from './utils/logger'; 
import connectDB from './config/database';
import { errorMiddleware } from './middleware/error';
import { rateLimiter }  from './middleware/rateLimit'; // Rate-limiting middleware
import { config } from './config/env'; // Configuration settings
import { setupScheduler } from './services/scheduler'; // Scheduler for periodic tasks
import { subscribeToChannel } from './services/youtube';

// connect to MongoDB
connectDB()

// Initialize Express app
const app = express();

app.set('trust proxy', 1); // trust first proxy (typical for Heroku/ngrok)

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.text({ type: 'application/atom+xml' }));
app.use(errorMiddleware);

// Apply rate-limiting to all routes except /api/webhooks
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/webhooks')) {
      return next(); 
    }
    return rateLimiter(req, res, next);
});

// Routes
app.use('/api', routes);


// Start the server
const PORT = config.port || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});




(async () => {
    logger.info('Subscribing to YouTube channel...');
    await subscribeToChannel(config.youtubeChannelId, `${config.baseUrl}/api/webhooks/youtube`);
    setupScheduler();
})();