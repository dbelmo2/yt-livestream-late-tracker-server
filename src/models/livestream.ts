import { Schema, model } from 'mongoose';

export const livestream = new Schema({
    videoId: String,
    scheduledStartTime: Date,
    actualStartTime: Date,
    lateTime: Number,
    title: String,
});

export default model('livestreams', livestream);

