import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Model } from '../data-access/mongodb/constants';
import { CacheHelper } from '../data-access/redis/cache-helper';
import { DatabaseContext } from '../types/context';

// Entities supported for generic lookup (excludes system/internal entities)
const SUPPORTED_ENTITIES = [
  Model.AFFILIATES,
  Model.OFFERS,
  Model.LANDINGPAGES,
  Model.ROTATIONS,
  Model.USERS,
  Model.GROUPS,
  Model.TAGS,
  Model.OFFERCATEGORY,
  Model.OFFERGROUP,
  Model.LANDINGPAGEGROUP,
] as const;

// Build list for prompt
const SUPPORTED_ENTITY_NAMES = SUPPORTED_ENTITIES.map(e => e).join(', ');

const FilterSchema = z.object({
  name: z.string().nullable().default(null).describe('Filter by name (partial match)'),
  status: z.enum(['active', 'not_active', 'any']).default('active').describe('Filter by status'),
  ids: z.array(z.string()).nullable().default(null).describe('Fetch specific IDs'),
});

// Minimum fields always included in results
const MIN_FIELDS = ['_id', 'name', 'status', 'created_on', 'updated_on'];

// Entity-specific status filter builders
// Rotations: status='on'/true + archiveStatus='active' (required)
// Most others: status='active'/'inactive' (no archiveStatus)
function buildStatusFilter(entityType: string, status: 'active' | 'not_active'): Record<string, any> {
  if (entityType === Model.ROTATIONS) {
    // Rotations use boolean/on-off status + archiveStatus
    if (status === 'active') {
      return {
        $or: [{ status: 'on' }, { status: true }],
        archiveStatus: 'active',
      };
    } else {
      return {
        $or: [
          { status: { $in: ['off', false] } },
          { archiveStatus: { $ne: 'active' } },
        ],
      };
    }
  }

  // Default: most entities use status: 'active'/'inactive'
  if (status === 'active') {
    return { status: 'active' };
  }
  return { status: { $ne: 'active' } };
}

const GenericEntityLookupSchema = z.object({
  entityType: z.enum(SUPPORTED_ENTITIES as unknown as [string, ...string[]])
    .describe(`Entity type to query: ${SUPPORTED_ENTITY_NAMES}`),
  filter: FilterSchema.default({}),
  limit: z.number().min(1).max(100).default(25).describe('Maximum results'),
  extraFields: z.array(z.string()).nullable().default(null).describe('Additional fields beyond minimum (_id, name, status, created_on, updated_on)'),
});

type GenericEntityLookupInput = z.infer<typeof GenericEntityLookupSchema>;

/**
 * Generic Entity Lookup Tool
 * Queries any supported entity from MongoDB using mongoose models
 * 
 * Use this for entities that don't have specific lookup tools:
 * - Affiliates, Offers, Landing Pages, Rotations, Users, Groups, Tags, etc.
 * 
 * For Campaign and TrafficSource, use the specific tools instead.
 */
export function createGenericEntityLookupTool(context: DatabaseContext) {
  return new DynamicStructuredTool({
    name: 'lookup_generic_entity',
    description: `Lookup any entity metadata from MongoDB.

Use this tool for entities WITHOUT specific lookup tools:
- Affiliate: Network affiliates
- Offer: Affiliate offers
- LandingPage: Landing pages
- Rotation: Traffic rotations
- User: System users
- Group: Entity groups
- Tag: Entity tags
- OfferCategory: Offer categories
- OffersGroup: Offer groups
- LandingPagesGroup: Landing page groups

For Campaign and TrafficSource, use lookup_campaigns or lookup_traffic_sources instead.

Returns entity objects with _id, name, status, and entity-specific fields.`,

    schema: GenericEntityLookupSchema,

    func: async (input: GenericEntityLookupInput) => {
      try {
        if (!context.mongoose || !context.mongooseConnection) {
          throw new Error('Mongoose connection not initialized');
        }

        const { entityType, filter, limit = 25, extraFields } = input;
        const mongoFilter: Record<string, any> = {};

        // Name filter (partial match, case-insensitive)
        if (filter?.name) {
          mongoFilter.name = { $regex: filter.name, $options: 'i' };
        }

        // Status filter - entity-specific logic
        if (filter?.status === 'active' || filter?.status === 'not_active') {
          Object.assign(mongoFilter, buildStatusFilter(entityType, filter.status));
        }

        // Specific IDs
        if (filter?.ids?.length) {
          mongoFilter._id = { $in: filter.ids };
        }

        // Get the model from mongoose
        const model = context.mongoose.models[entityType];
        if (!model) {
          return JSON.stringify({
            success: false,
            error: `Model not found: ${entityType}. Available: ${Object.keys(context.mongoose.models).join(', ')}`,
            data: [],
          });
        }

        // Merge minimum fields with extra fields (no duplicates)
        const allFields = [...MIN_FIELDS];
        if (extraFields?.length) {
          for (const field of extraFields) {
            if (!allFields.includes(field)) {
              allFields.push(field);
            }
          }
        }
        const selectFields = allFields.join(' ');

        const { result } = await CacheHelper.withCache(
          `entity_${entityType.toLowerCase()}`,
          { mongoFilter, selectFields, limit },
          async () => {
            const data = await model
              .find(mongoFilter)
              .select(selectFields)
              .limit(limit)
              .sort({ created_on: -1 })
              .lean();
            return data;
          }
        );

        console.log(`✅ Generic entity lookup (${entityType}) returned ${result.length} results`);

        return JSON.stringify({
          success: true,
          data: result,
          count: result.length,
          entityType,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Generic entity lookup error:', errorMessage);
        return JSON.stringify({
          success: false,
          error: errorMessage,
          data: [],
        });
      }
    },
  });
}

// Export supported entities for use in agent prompt
export { SUPPORTED_ENTITY_NAMES };
