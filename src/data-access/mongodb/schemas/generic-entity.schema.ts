import { Schema } from 'mongoose';

/**
 * Generic schema for simple entities: Group, Tag, OfferCategory, OffersGroup, LandingPagesGroup, User
 */
const simpleEntitySchema = (collection: string) =>
  new Schema(
    {
      name: { type: String, required: true },
      status: { type: String, default: 'active' },
      created_on: { type: Date, default: Date.now },
      updated_on: { type: Date, default: Date.now },
    },
    { collection, strict: false }
  );

export const GroupSchema = simpleEntitySchema('groups');
export const TagSchema = simpleEntitySchema('tags');
export const OfferCategorySchema = simpleEntitySchema('offercategories');
export const OffersGroupSchema = simpleEntitySchema('offersgroups');
export const LandingPagesGroupSchema = simpleEntitySchema('landingpagegroups');
export const UserSchema = simpleEntitySchema('users');
