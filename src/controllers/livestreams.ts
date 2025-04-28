import { Request, Response } from 'express';
import Livestream from '../models/livestream';
import { ValidationError } from '../utils/errors';

export const getLivestreams = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    if (isNaN(page) || page < 1) {
      throw new ValidationError('Invalid page parameter: must be a positive number');
    }
    const limit = 10;
    const livestreams = await Livestream.find()
      .skip((page - 1) * limit)
      .limit(limit)
      .catch((err) => {
        throw new Error(`Database query failed: ${err.message}`);
      });
    res.json({ livestreams });
  } catch (error) {
    throw error instanceof Error ? error : new Error('Unknown error in getLivestreams');
  }
};