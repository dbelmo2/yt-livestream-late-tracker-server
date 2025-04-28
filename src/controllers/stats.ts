import { Request, Response } from 'express';
import Stats from '../models/stats';
import { NotFoundError } from '../utils/errors';

export const getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await Stats.findOne().catch((err) => {
        throw new Error(`Database query failed: ${err.message}`);
      });
      if (!stats) {
        throw new NotFoundError('No stats found');
      }
      res.json(stats);
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error in getStats');
    }
};