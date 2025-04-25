//TODO: Implemention function to fetch livestream details for a given livestreamId
import youtube  from "../config/youtube";
import logger from "../utils/logger";
import Livestream from "../models/livestream";
import Stats from "../models/stats";
import { Livestream as LivestreamType } from "../utils/types";


export const getLivestreamDetails = async (livestreamId: string) => {
    try {
        const response = await youtube.videos.list({
            part: ['snippet,liveStreamingDetails'],
            id: [livestreamId],
        });
        return response.data.items?.[0] ?? null; // Return the first item or null if not found
    } catch (error) {
        console.error('Error fetching livestream details:', error);
        throw error;
    }
}

export const insertLivestreamDetails = async (livestream: LivestreamType) => {
    try {
        const newLivestream = new Livestream(livestream);
        await newLivestream.save();
        logger.info(`Inserted livestream details for videoId: ${livestream.videoId}`);
    } catch (error) {
        logger.error('Error inserting livestream details:', error);
        throw error;
    }
}

export const updateStats = async (lateTime: number) => {
    try {
        const existingStats = await Stats.findOne({});
        if (existingStats) {
            existingStats.totalLateTime = (existingStats.totalLateTime ?? 0) + lateTime;
            existingStats.streamCount = (existingStats.streamCount ?? 0) + 1;
            existingStats.lastUpdateDate = new Date();
            await existingStats.save();
        } else {
            const newStats = new Stats({
                totalLateTime: lateTime,
                streamCount: 1,
                lastUpdateDate: new Date(),
            });
            await newStats.save();
        }
        logger.info(`Updated stats totalLateTime with: ${lateTime}`);
    } catch (error) {
        logger.error('Error updating stats:', error);
        throw error;
    }
}

export const getStats = async () => {
    try {
        const stats = await Stats.findOne({});
        return stats;
    } catch (error) {
        logger.error('Error fetching stats:', error);
        throw error;
    }
}


