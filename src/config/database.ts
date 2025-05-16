import mongoose from "mongoose";
import logger from "../utils/logger";
import { config } from "./env";

export default async () => {
    try {
        logger.info(`Connecting to MongoDB using URI "${config.mongoUri}"`);
        logger.info(`process.env.MONGO_URI ${process.env.MONGO_URI}`);
        await mongoose.connect(config.mongoUri as string);
        logger.info("MongoDB connected successfully");
    }   catch (error) {
        logger.error("MongoDB connection error:", error);
    }

}