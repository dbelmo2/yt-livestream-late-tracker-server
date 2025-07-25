import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors';
import logger from '../utils/logger';

export const rateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    message: async () => {
        throw new RateLimitError('Too many requests from this IP, please try again after 15 minutes.');
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
    handler: (req, res, options) => {
        logger.warn(`Rate limit reached for IP ${req.ip}`);
    }
});