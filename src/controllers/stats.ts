import { Request, Response } from 'express';
import Stats from '../models/stats';
import logger from '../utils/logger';
import { formatDuration } from '../utils/time';
import { generateStats } from '../services/scheduler';

export const getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      logger.debug('Fetching stats from database');
      if (req.query.regen === 'true') {
        logger.info('Recalculating stats as requested');
        await generateStats();
      }
      const stats = await Stats.findOne().catch((err) => {
        throw new Error(`Database query failed: ${err.message}`);
      });
      if (!stats) {
        res.json({ streamCount: 0, totalLateTime: 0 });
        return;
      }
      // convert to JSON and remove _id and __v fields
      const statsObject = stats.toObject();

      const humanReadable = formatDuration(statsObject.totalLateTime);
      logger.info('Fetched stats from database', { streamCount: statsObject.streamCount, totalLateTime: statsObject.totalLateTime, lastUpdateDate: statsObject.lastUpdateDate });
      logger.info(`Human readable format: ${humanReadable}`);
      res.json({ humanReadable, ...statsObject });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error in getStats');
    }
};