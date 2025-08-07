import express from 'express';
import { informGameShowIsLiveAPI } from '../services/game';

const router = express.Router();
router.post('/inform-live', informGameShowIsLiveAPI);
export default router;