import express from 'express';
import { informGameShowIsLive } from '../services/game';

const router = express.Router();
router.post('/inform-live', informGameShowIsLive);
export default router;