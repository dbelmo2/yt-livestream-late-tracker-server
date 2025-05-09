declare global {
    namespace NodeJS {
      interface ProcessEnv {
        PORT: string;
        MONGO_URI: string;
        YOUTUBE_API_KEY: string;
        BASE_URL: string;
        WEBHOOK_SECRET: string;
        MAX_RETRIES: string;
        YOUTUBE_CHANNEL_ID: string;
        REGIONAL_QUEUE_TIMEOUT: string;
        MAX_PLAYERS: string;
        EARLY_START_MIN_PLAYERS: string;
        FALLBACK_MIN_PLAYERS: string;
        FALLBACK_START_TIMEOUT: string;
      }
    }
  }
  
  export {};