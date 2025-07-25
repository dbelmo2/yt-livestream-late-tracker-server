import { Schema, model } from 'mongoose';

const dayStatsSchema = new Schema({
  totalLateTime: { type: Number, required: true, default: 0 },
  count: { type: Number, required: true, default: 0 },
}, { _id: false });

const Stats = new Schema({
  streamCount: { type: Number, default: 0 },
  totalLateTime: { type: Number, default: 0 },
  averageLateTime: { type: Number, default: 0 },
  maxLateTime: { type: Number, default: 0 },
  daily: {
    type: new Schema({
      sunday: { type: dayStatsSchema, required: true, default: () => ({}) },
      monday: { type: dayStatsSchema, required: true, default: () => ({}) },
      tuesday: { type: dayStatsSchema, required: true, default: () => ({}) },
      wednesday: { type: dayStatsSchema, required: true, default: () => ({}) },
      thursday: { type: dayStatsSchema, required: true, default: () => ({}) },
      friday: { type: dayStatsSchema, required: true, default: () => ({}) },
      saturday: { type: dayStatsSchema, required: true, default: () => ({}) },
    }, { _id: false }),
    required: true,
    default: () => ({
      sunday: {},
      monday: {},
      tuesday: {},
      wednesday: {},
      thursday: {},
      friday: {},
      saturday: {},
    }),
  },
  lastUpdateDate: { type: Date, default: Date.now },
});

export default model('stats', Stats);