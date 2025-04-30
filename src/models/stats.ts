import { Schema, model } from 'mongoose';

const Stats = new Schema({
    streamCount: { type: Number, default: 0 },
    totalLateTime: { type: Number, default: 0 },
    lastUpdateDate: Date,
});

export default model('stats', Stats);

