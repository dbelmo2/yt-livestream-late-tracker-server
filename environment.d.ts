declare global {
    namespace NodeJS {
      interface ProcessEnv {
        YOUTUBE_API_KEY: string;
        MONGO_URL: string;
        MONGO_DB: string;
        MONGO_COLLECTION: string;
        MONGO_URI: string;
        MONGO_PORT: string;
      }
    }
  }
  
  export {};