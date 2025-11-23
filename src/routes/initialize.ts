import express from 'express';
import { handleInitialize, handleInitializeByVideoIds } from '../controllers/initialize';

const router = express.Router();
router.post('/', handleInitialize);
router.post('/byVideoIds', handleInitializeByVideoIds);
export default router;