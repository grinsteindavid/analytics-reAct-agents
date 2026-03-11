import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { TRAFFIC_API_NAMES } from '../data-access/mongodb/constants';
import { CacheHelper } from '../data-access/redis/cache-helper';
import { getAllTrafficSources } from '../data-access/mongodb/traffic-sources';
import { DatabaseContext } from '../types/context';

const TrafficSourceLookupSchema = z.object({
  apiName: z.nativeEnum(TRAFFIC_API_NAMES).optional()
    .describe('Platform identifier: GOOGLE, FACEBOOK, TABOOLA, MEDIAGO, OUTBRAIN, MGID, etc.'),
  status: z.enum(['active', 'not_active', 'any']).default('active')
    .describe('Filter by traffic source status'),
  ids: z.array(z.string()).optional()
    .describe('Fetch specific traffic source IDs'),
  limit: z.number().min(1).max(100).default(10)
    .describe('Maximum results to return'),
});

type TrafficSourceLookupInput = z.infer<typeof TrafficSourceLookupSchema>;

/**
 * Traffic Source Lookup Tool
 * Queries traffic sources from MongoDB by api.name (platform identifier)
 * 
 * IMPORTANT: api.name is the platform identifier (GOOGLE, FACEBOOK, TABOOLA, etc.)
 * This is different from the traffic source's user-defined nickname (name field)
 */
export function createTrafficSourceLookupTool(context: DatabaseContext) {
  return new DynamicStructuredTool({
    name: 'lookup_traffic_sources',
    description: `Lookup traffic source metadata from MongoDB by platform (api.name).

Use this tool to:
- Get traffic source IDs for a platform (GOOGLE, FACEBOOK, TABOOLA, MEDIAGO, etc.)
- List traffic sources by status (active/paused)
- Get traffic source details for filtering campaigns

IMPORTANT: Use apiName parameter for platform filtering (GOOGLE, FACEBOOK, etc.)
The 'name' field in results is the user's nickname, NOT the platform identifier.

Returns traffic source objects with _id, name (nickname), status, and api.name (platform).`,

    schema: TrafficSourceLookupSchema,

    func: async (input: TrafficSourceLookupInput) => {
      try {
        if (!context.mongoose || !context.mongooseConnection) {
          throw new Error('Mongoose connection not initialized');
        }

        const { apiName, status = 'any', ids, limit = 10 } = input;
        const mongoFilter: Record<string, any> = {};

        // Platform filter (api.name)
        if (apiName) {
          mongoFilter['api.name'] = apiName;
        }

        // Status filter
        if (status === 'active') {
          mongoFilter.status = 'active';
        } else if (status === 'not_active') {
          mongoFilter.status = { $ne: 'active' };
        }

        // Specific IDs
        if (ids?.length) {
          mongoFilter._id = { $in: ids };
        }

        const fields = '_id name status api.name shortname created_on updated_on';

        const cacheParams = { mongoFilter, fields, limit };
        const { result } = await CacheHelper.withCache(
          'entity_traffic_source',
          cacheParams,
          async () => {
            return getAllTrafficSources(mongoFilter)
              .select(fields)
              .limit(limit)
              .sort({ 'api.name': 1 })
              .lean();
          }
        );

        console.log(`✅ Traffic source lookup returned ${result.length} results`);

        return JSON.stringify({
          success: true,
          data: result,
          count: result.length,
          entityType: 'TrafficSource',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Traffic source lookup error:', errorMessage);
        return JSON.stringify({
          success: false,
          error: errorMessage,
          data: [],
        });
      }
    },
  });
}
