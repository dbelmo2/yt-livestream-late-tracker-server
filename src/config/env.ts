export const config = {
    port: parseInt(process.env.PORT || '3000'),
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/livestream-tracker',
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    baseUrl: process.env.BASE_URL || 'http://localhost:5000',
    webhookSecret: process.env.WEBHOOK_SECRET || 'your-secret-key',
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    youtubeChannelId: process.env.YOUTUBE_CHANNEL_ID || 'your-channel-id',
};