import express from 'express';
import helmet from 'helmet';
import winston from 'winston';
import routes from './routes/routes'; // Adjust the extension based on your TypeScript setup

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(express.json());

// Logger setup with Winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'server.log' }),
    ],
});

// Routes
app.use('/api', routes);

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});