import mongoose from "mongoose";
import logger from "../utils/logger";

export default async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        logger.info("MongoDB connected successfully");
    }   catch (error) {
        logger.error("MongoDB connection error:", error);
    }

}