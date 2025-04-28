import express from 'express';
import { getLivestreams } from '../controllers/livestreams';

const router = express.Router();
router.get('/', getLivestreams);
export default router;