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
      }
    }
  }
  
  export {};