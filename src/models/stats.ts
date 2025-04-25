import { Schema, model } from 'mongoose';

const Stats = new Schema({
    totalLateTime: Number,
    streamCount: Number,
    lastUpdateDate: Date
});

export default model('stats', Stats);

