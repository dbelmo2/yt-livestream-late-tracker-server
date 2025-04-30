import { Request, Response } from 'express';
import Livestream from '../models/livestream';
import { ApiError, NotFoundError, ValidationError } from '../utils/errors';
import logger from '../utils/logger';

export const getLivestreams = async (req: Request, res: Response): Promise<void> => {
  if (req.params.videoId) {
    const livestream = await Livestream.findOne({ videoId: req.params.videoId }).catch((err) => {
      throw new ApiError(`Database query failed: ${err.message}`, 500);
    });

    if (!livestream) {
      throw new NotFoundError('Livestream not found');
    }

    logger.info(`Retrieved livestream ${req.params.videoId}`);
    res.status(200).json(livestream);
  } else {

    // Fetch paginated livestreams using skip and limit
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    if (isNaN(skip) || skip < 0) {
      throw new ValidationError('Invalid skip parameter: must be a non-negative number');
    }
    if (isNaN(limit) || limit < 1) {
      throw new ValidationError('Invalid limit parameter: must be a positive number');
    }

    const livestreams = await Livestream.find({}, null, { skip, limit }).catch((err) => {
        throw new ApiError(`Database query failed: ${err.message}`, 500);
    });

      logger.info(`Fetched ${livestreams.length} livestreams with skip=${skip}, limit=${limit}`);
      res.status(200).json({ livestreams, skip, limit, total: await Livestream.countDocuments() });
  }
};