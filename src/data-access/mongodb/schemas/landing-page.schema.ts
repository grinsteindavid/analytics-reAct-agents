import { Schema } from 'mongoose';

export const LandingPageSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'not_active', 'deleted'], default: 'active' },
    url: { type: String },
    created_on: { type: Date, default: Date.now },
    updated_on: { type: Date, default: Date.now },
  },
  { collection: 'landingpages', strict: false }
);
