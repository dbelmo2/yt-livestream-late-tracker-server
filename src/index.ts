import express from 'express';
import helmet from 'helmet';

import routes from './routes/index'; 
import logger from './utils/logger'; 
import connectDB from './config/database';

import { insertLivestreamDetails, updateStats } from './services/youtube';

// connect to MongoDB
connectDB()

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(express.json());

// Routes
app.use('/api', routes);

// TODO: Test GET stats endpoint


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
});