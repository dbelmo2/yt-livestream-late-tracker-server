import { config } from "../config/env";
import logger from "../utils/logger";
import { Request, Response } from "express";


export const informGameShowIsLive = async (videoId: string, title: string) => {
    try {
        const response = await fetch(`${config.gameServerUrl}/api/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, title }),
        });
        if (!response.ok) {
        const text = await response.text();
        throw new Error(`Game server responded with status ${response.status}: ${text}`);
        }
        logger.info(`Informed game server of live show: ${videoId} - ${title}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to inform game server of live show: ${errorMessage}`);
    }
}

export const informGameShowIsLiveAPI = async (req: Request, res: Response) => {
    try {
      const { videoId, title } = req.body;
      const response = await fetch(`${config.gameServerUrl}/api/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: videoId && title ? JSON.stringify({ videoId, title }) : undefined,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Game server responded with status ${response.status}: ${text}`);
      }
      logger.info(`Informed game server of live show: ${videoId} - ${title}`);
      res.status(200).json({ message: 'Game server informed successfully' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to inform game server of live show: ${errorMessage}`);
      res.status(500).json({ error: errorMessage });
    }
}