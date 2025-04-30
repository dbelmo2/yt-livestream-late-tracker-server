import { Request, Response } from 'express';
import Stats from '../models/stats';

export const getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await Stats.findOne().catch((err) => {
        throw new Error(`Database query failed: ${err.message}`);
      });
      if (!stats) {
        res.json({ streamCount: 0, totalLateTime: 0 });
        return;
      }
      res.json(stats);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error in getStats');
    }
};