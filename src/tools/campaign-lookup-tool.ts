import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CacheHelper } from '../data-access/redis/cache-helper';
import { getAllCampaigns } from '../data-access/mongodb/campaigns';
import { DatabaseContext } from '../types/context';

const CampaignLookupSchema = z.object({
  status: z.enum(['active', 'not_active', 'any']).default('active')
    .describe('Filter by campaign status: active, not_active, or any'),
  trafficSourceIds: z.array(z.string()).optional()
    .describe('Filter campaigns by traffic source IDs (from traffic source lookup)'),
  ids: z.array(z.string()).optional()
    .describe('Fetch specific campaign IDs'),
  limit: z.number().min(1).max(100).default(25)
    .describe('Maximum results to return'),
});

type CampaignLookupInput = z.infer<typeof CampaignLookupSchema>;

/**
 * Campaign Lookup Tool
 * Queries campaigns from MongoDB with status and traffic source filters
 */
export function createCampaignLookupTool(context: DatabaseContext) {
  return new DynamicStructuredTool({
    name: 'lookup_campaigns',
    description: `Lookup campaign metadata from MongoDB.

Use this tool to:
- List campaigns by status (active/paused)
- Get campaign IDs for filtering drilldowns
- Fetch specific campaigns by ID

Returns campaign objects with _id, name, status, and trafficSource reference.`,

    schema: CampaignLookupSchema,

    func: async (input: CampaignLookupInput) => {
      try {
        if (!context.mongoose || !context.mongooseConnection) {
          throw new Error('Mongoose connection not initialized');
        }

        const { status = 'any', trafficSourceIds, ids, limit = 25 } = input;
        const mongoFilter: Record<string, any> = {};

        // Status filter
        if (status === 'active') {
          mongoFilter.status = 'active';
        } else if (status === 'not_active') {
          mongoFilter.status = { $ne: 'active' };
        }

        // Traffic source filter
        if (trafficSourceIds?.length) {
          mongoFilter.trafficSource = { $in: trafficSourceIds };
        }

        // Specific IDs
        if (ids?.length) {
          mongoFilter._id = { $in: ids };
        }

        const fields = ['_id', 'name', 'status', 'trafficSource', 'created_on', 'updated_on'];

        const cacheParams = { mongoFilter, fields, limit };
        const { result } = await CacheHelper.withCache(
          'entity_campaign',
          cacheParams,
          async () => {
            return getAllCampaigns(mongoFilter)
              .populate({ path: 'trafficSource', select: '_id api.name name' })
              .select(fields.join(' '))
              .limit(limit)
              .sort({ created_on: -1 })
              .lean();
          }
        );

        console.log(`✅ Campaign lookup returned ${result.length} results`);

        return JSON.stringify({
          success: true,
          data: result,
          count: result.length,
          entityType: 'Campaign',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Campaign lookup error:', errorMessage);
        return JSON.stringify({
          success: false,
          error: errorMessage,
          data: [],
        });
      }
    },
  });
}
