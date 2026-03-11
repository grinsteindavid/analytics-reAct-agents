import { Schema } from 'mongoose';

export const CampaignSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'not_active', 'deleted'], default: 'active' },
    trafficSource: { type: Schema.Types.ObjectId, ref: 'TrafficSource' },
    created_on: { type: Date, default: Date.now },
    updated_on: { type: Date, default: Date.now },
  },
  { collection: 'campaigns', strict: false }
);
