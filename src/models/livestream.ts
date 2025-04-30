import { Schema, model } from 'mongoose';

export const livestream = new Schema({
    videoId: { type: String, required: true, unique: true },    
    scheduledStartTime: Date,
    actualStartTime: Date,
    lateTime: Number,
    title: String,
});

export default model('livestreams', livestream);

