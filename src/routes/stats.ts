import express from 'express';
import { handleGetStats } from '../controllers/stats';

const router = express.Router();
router.get('/', handleGetStats);
export default router;