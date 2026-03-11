import { Schema } from 'mongoose';

export const TrafficSourceSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'not_active', 'deleted'], default: 'active' },
    api: {
      name: { type: String },
    },
    shortname: { type: String },
    created_on: { type: Date, default: Date.now },
    updated_on: { type: Date, default: Date.now },
  },
  { collection: 'trafficsources', strict: false }
);
