import { google } from 'googleapis';



export default google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY,
});