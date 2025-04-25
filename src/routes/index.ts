import express from 'express';
import liveStreamsRouter from './livestreams';
import statsRouter from './stats';
import webhooksRouter from './webhooks';


const router = express.Router();

router.use('/livestreams', liveStreamsRouter);
router.use('/stats', statsRouter);
router.use('/webhooks', webhooksRouter);


export default router;