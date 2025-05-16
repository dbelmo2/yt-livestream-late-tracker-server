import express from 'express';
import liveStreamsRouter from './livestreams';
import statsRouter from './stats';
import webhooksRouter from './webhooks';
import initializeRouter from './initialize';
import matchRouter from './match';
import heathRouter from './health';

const router = express.Router();

router.use('/livestreams', liveStreamsRouter);
router.use('/stats', statsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/initialize', initializeRouter);
router.use('/match', matchRouter);
router.use('/health', heathRouter);


export default router;