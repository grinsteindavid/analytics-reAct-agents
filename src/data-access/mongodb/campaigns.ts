import { getMongoose } from './connection';
import { Model } from './constants';

/**
 * Query campaigns from MongoDB
 * Excludes deleted documents, returns a chainable Mongoose query
 */
export function getAllCampaigns(filter: Record<string, any>) {
  const mongoose = getMongoose();
  const model = mongoose.models[Model.CAMPAIGNS];
  if (!model) throw new Error(`Model ${Model.CAMPAIGNS} not registered`);

  const finalFilter: Record<string, any> = { ...filter };

  if (filter?.status) {
    const statusConditions = [
      { status: { $ne: 'deleted' } },
      { status: filter.status },
    ];

    if (Array.isArray(finalFilter.$and)) {
      finalFilter.$and = [...finalFilter.$and, ...statusConditions];
    } else {
      finalFilter.$and = statusConditions;
    }

    delete finalFilter.status;
  } else {
    finalFilter.status = { $ne: 'deleted' };
  }

  return model.find(finalFilter);
}
