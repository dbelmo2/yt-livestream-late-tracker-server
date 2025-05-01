import { Request, Response } from 'express';
import Stats from '../models/stats';
import logger from '../utils/logger';

export const getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.debug('Fetching stats from database');
      const stats = await Stats.findOne().catch((err) => {
        throw new Error(`Database query failed: ${err.message}`);
      });
      if (!stats) {
        res.json({ streamCount: 0, totalLateTime: 0 });
        return;
      }
      // convert to JSON and remove _id and __v fields
      const { streamCount, totalLateTime, lastUpdateDate } = stats.toObject();
      logger.info('Fetched stats from database', { streamCount, totalLateTime, lastUpdateDate });
      res.json(stats);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error in getStats');
    }
};