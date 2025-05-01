import express from 'express';
import { handleInitialize } from '../controllers/initialize';

const router = express.Router();
router.post('/', handleInitialize);
export default router;