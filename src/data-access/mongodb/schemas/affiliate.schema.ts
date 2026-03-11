import { Schema } from 'mongoose';

export const AffiliateSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'not_active', 'deleted'], default: 'active' },
    created_on: { type: Date, default: Date.now },
    updated_on: { type: Date, default: Date.now },
  },
  { collection: 'affiliates', strict: false }
);
