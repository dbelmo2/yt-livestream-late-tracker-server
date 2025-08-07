import express from 'express';
import liveStreamsRouter from './livestreams';
import statsRouter from './stats';
import webhooksRouter from './webhooks';
import initializeRouter from './initialize';
import heathRouter from './health';
import testRouter from './test';

const router = express.Router();

router.use('/livestreams', liveStreamsRouter);
router.use('/stats', statsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/initialize', initializeRouter);
router.use('/health', heathRouter);
router.use('/test', testRouter);

export default router;