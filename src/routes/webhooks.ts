import express from "express";
import { handleWebhook } from "../controllers/webhooks";

const router = express.Router();

router.get('/youtube', handleWebhook);
router.post('/youtube', handleWebhook);

export default router;