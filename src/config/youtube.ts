import { google } from 'googleapis';
import { config } from '../config/env';


export default google.youtube({
    version: 'v3',
    auth: config.youtubeApiKey,
});