import express from 'express';
import { handleGetLivestreams } from '../controllers/livestreams';

const router = express.Router();
router.get('/', handleGetLivestreams);
export default router;