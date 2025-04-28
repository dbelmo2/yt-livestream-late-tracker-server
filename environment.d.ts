declare global {
    namespace NodeJS {
      interface ProcessEnv {
        YOUTUBE_API_KEY: string;
        MONGODB_URI: string;
        YOUTUBE_CHANNEL_ID: string;
        BASE_URL: string;
        WEBHOOK_SECRET: string;
      }
    }
  }
  
  export {};