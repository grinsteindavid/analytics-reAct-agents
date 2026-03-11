import { getMongoose } from './connection';
import { Model } from './constants';

/**
 * Query traffic sources from MongoDB
 * Excludes deleted documents, returns a chainable Mongoose query
 */
export function getAllTrafficSources(filter: Record<string, any>) {
  const mongoose = getMongoose();
  const model = mongoose.models[Model.TRAFFICSOURCE];
  if (!model) throw new Error(`Model ${Model.TRAFFICSOURCE} not registered`);

  const finalFilter = {
    ...filter,
    status: { $ne: 'deleted' },
  };

  return model.find(finalFilter);
}
