import express from 'express';
import { getMatch } from '../controllers/match';

const router = express.Router();
router.get('/', getMatch);
export default router;