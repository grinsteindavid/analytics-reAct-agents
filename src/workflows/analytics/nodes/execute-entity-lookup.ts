import { CampaignAnalysisState } from '../../../types/state';
import { EntityLookupAgent } from '../../../agents/entity-lookup-agent';

/**
 * Execute Entity Lookup Node
 * Looks up entity metadata from MongoDB (campaigns, traffic sources)
 */
export async function executeEntityLookup(
  state: CampaignAnalysisState,
  entityLookupAgent: EntityLookupAgent
): Promise<Partial<CampaignAnalysisState>> {
  console.log('🔍 Executing entity lookup...');
  const startTime = Date.now();

  const result = await entityLookupAgent.lookup(state);

  const duration = Date.now() - startTime;
  console.log(`✅ Entity lookup complete (${duration}ms)`);

  return {
    ...result,
    metadata: {
      ...state.metadata,
      ...result.metadata,
      timings: [
        ...(state.metadata.timings || []),
        { step: 'execute_entity_lookup', type: 'tool' as const, duration, timestamp: startTime },
      ],
    },
  };
}
