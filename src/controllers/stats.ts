import { getStats } from '../services/youtube';
import logger from '../utils/logger';
import { Request, Response } from 'express';

exports.getStats = async (req: Request, res: Response) => {
    try {
        logger.info('Processing GET stats request...');
        const stats = await getStats();
        res.status(200).json(stats);
    } catch (error) {
        logger.error('Unable to complete GET stats request', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};