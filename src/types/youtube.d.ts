export interface ILivestreamSnippet {
    title?: string | null | undefined;
    publishedAt?: string | null | undefined;
    liveBroadcastContent?: string | null | undefined;
}

export interface ILivestreamingDetails {
    actualStartTime?: string | null | undefined;
    scheduledStartTime?: string | null | undefined;
    concurrentViewers?: string | null | undefined;
}
  
export interface ILivestreamItem {
    id?: string | null | undefined;
    snippet?: ILivestreamSnippet | undefined;
    liveStreamingDetails?: ILivestreamingDetails | undefined;
}