import mongoose, { Schema, Document } from 'mongoose';

export interface IFailedLivestream extends Document {
  videoId: string;
  errorMessage: string;
  retryCount: number;
  lastAttempt: Date;
  createdAt: Date;
}

const FailedLivestreamSchema: Schema = new Schema({
  videoId: { type: String, required: true, unique: true },
  errorMessage: { type: String, required: true },
  retryCount: { type: Number, default: 0 },
  lastAttempt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, expires: '3d' }, // Auto-delete after 3 days
});

export const FailedLivestream = mongoose.model<IFailedLivestream>('FailedLivestream', FailedLivestreamSchema);