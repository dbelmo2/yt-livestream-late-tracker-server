export interface ILivestream {
    videoId: string;
    scheduledStartTime: Date;
    actualStartTime?: Date;
    lateTime: number;
    title: string;
}