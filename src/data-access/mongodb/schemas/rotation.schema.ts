import { Schema } from 'mongoose';

export const RotationSchema = new Schema(
  {
    name: { type: String, required: true },
    status: { type: Schema.Types.Mixed }, // String 'on'/'off' or Boolean
    archiveStatus: { type: String, enum: ['active', 'archived'], default: 'active' },
    created_on: { type: Date, default: Date.now },
    updated_on: { type: Date, default: Date.now },
  },
  { collection: 'rotations', strict: false }
);
