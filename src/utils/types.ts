export interface Livestream {
    videoId: string;
    scheduledStartTime: Date;
    actualStartTime: Date;
    lateTime: number;
    date: string;
    title: string;
}
