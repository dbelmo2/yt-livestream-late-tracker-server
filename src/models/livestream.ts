import { Schema, model } from 'mongoose';

export const livestream = new Schema({
    videoId: String,
    scheduledStartTime: Date,
    actualStartTime: Date,
    lateTime: Number,
    date: String,
    title: String,
});

export default model('livestreams', livestream);

