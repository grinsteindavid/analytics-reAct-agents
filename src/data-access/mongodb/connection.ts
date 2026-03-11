import mongoose, { Mongoose } from 'mongoose';
import { Model } from './constants';
import {
  CampaignSchema,
  TrafficSourceSchema,
  OfferSchema,
  AffiliateSchema,
  LandingPageSchema,
  RotationSchema,
  GroupSchema,
  TagSchema,
  OfferCategorySchema,
  OffersGroupSchema,
  LandingPagesGroupSchema,
  UserSchema,
} from './schemas';

const MODEL_SCHEMA_MAP: Record<string, mongoose.Schema> = {
  [Model.CAMPAIGNS]: CampaignSchema,
  [Model.TRAFFICSOURCE]: TrafficSourceSchema,
  [Model.OFFERS]: OfferSchema,
  [Model.AFFILIATES]: AffiliateSchema,
  [Model.LANDINGPAGES]: LandingPageSchema,
  [Model.ROTATIONS]: RotationSchema,
  [Model.GROUPS]: GroupSchema,
  [Model.TAGS]: TagSchema,
  [Model.OFFERCATEGORY]: OfferCategorySchema,
  [Model.OFFERGROUP]: OffersGroupSchema,
  [Model.LANDINGPAGEGROUP]: LandingPagesGroupSchema,
  [Model.USERS]: UserSchema,
};

/**
 * Register all Mongoose models so mongoose.models[entityType] works
 */
function registerModels(conn: Mongoose): void {
  for (const [name, schema] of Object.entries(MODEL_SCHEMA_MAP)) {
    if (!conn.models[name]) {
      conn.model(name, schema);
    }
  }
}

let mongooseInstance: Mongoose | null = null;

export async function connectMongo(uri: string): Promise<Mongoose> {
  if (mongooseInstance) return mongooseInstance;

  mongooseInstance = await mongoose.connect(uri);
  registerModels(mongooseInstance);
  console.log('[MongoDB] Connected and models registered');
  return mongooseInstance;
}

export function getMongoose(): Mongoose {
  if (!mongooseInstance) throw new Error('[MongoDB] Not connected');
  return mongooseInstance;
}
