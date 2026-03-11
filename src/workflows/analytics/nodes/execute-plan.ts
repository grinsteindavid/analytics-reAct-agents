import { CampaignAnalysisState, PlanStep } from '../../../types/state';
import { DrilldownAgent } from '../../../agents/drilldown-agent';
import { EntityLookupAgent } from '../../../agents/entity-lookup-agent';
import { EntityReference, extractEntitiesFromData } from '../../../types/entity';
// Note: Debug logging happens inside each agent

interface AgentContext {
  drilldownAgent: DrilldownAgent;
  entityLookupAgent: EntityLookupAgent;
}

type AccumulatedDataItem = {
  type: 'drilldown' | 'entity_lookup';
  instruction: string;
  reason: string;
  data: any;
  entities: EntityReference[];
  dateRange?: { from: string; to: string };
  timestamp: number;
};

//type StepType = 'drilldown' | 'entity_lookup';

/**
 * Execute Plan Node
 * 
 * Execution model:
 * - Root-level steps run in PARALLEL (independent branches)
 * - Each step's 'next' chain runs SEQUENTIALLY (dependent steps)
 * 
 * Example plan:
 * [
 *   { type: "entity_lookup", instruction: "Get Google TS", next: { type: "drilldown", instruction: "..." } },
 *   { type: "entity_lookup", instruction: "Get Facebook TS", next: { type: "drilldown", instruction: "..." } }
 * ]
 * 
 * Execution:
 * - Branch 1: entity_lookup → drilldown (sequential)
 * - Branch 2: entity_lookup → drilldown (sequential)
 * - Branches 1 & 2 run in parallel
 */
export async function executePlan(
  state: CampaignAnalysisState,
  agents: AgentContext
): Promise<Partial<CampaignAnalysisState>> {
  const plan = state.executionPlan?.plan;

  // No plan or empty plan - skip execution
  if (!plan || plan.length === 0) {
    console.log('📋 No execution plan - skipping to summary');
    return {};
  }

  console.log(`🚀 Executing plan: ${plan.length} step(s)`);
  const startTime = Date.now();

  // Get existing accumulated data from previous cycles
  const existingAccumulated = state.accumulatedData || [];

  // Execute all steps in parallel
  const stepPromises = plan.map(step => executeStep(step, state, agents, existingAccumulated));
  const stepResults = await Promise.all(stepPromises);

  // Filter out null results
  const results: AccumulatedDataItem[] = stepResults.filter((r): r is AccumulatedDataItem => r !== null);

  const duration = Date.now() - startTime;
  console.log(`✅ Plan executed (${duration}ms)`);

  // Collect results into accumulated data
  const validResults = results.filter((r): r is AccumulatedDataItem => r !== null);

  const totalSteps = plan.length;

  // Get drilldown data from last drilldown result (for summary agent)
  let drilldownData: any[] | undefined;
  for (const result of validResults) {
    if (result.type === 'drilldown' && result.data) {
      drilldownData = result.data;
    }
  }

  // NOTE: entities are stored per-step in accumulatedData[i].entities
  // They get merged into conversationHistory at turn end (in index.ts)
  // No state.entities or queryContext needed here

  return {
    accumulatedData: validResults,
    drilldownData,
    metadata: {
      ...state.metadata,
      toolCalls: state.metadata.toolCalls + totalSteps,
      timings: [
        ...(state.metadata.timings || []),
        { step: 'execute_plan', type: 'tool' as const, duration, timestamp: startTime },
      ],
    },
  };
}

/**
 * Resolve entities from specified sources
 * Returns entities from the sources specified in entitySources, or empty array if none specified
 */
function resolveEntities(
  step: PlanStep,
  state: CampaignAnalysisState,
  accumulatedData: AccumulatedDataItem[]
): EntityReference[] {
  const sources = step.entitySources;

  // No sources specified = no entity filtering (fresh query)
  if (!sources || sources.length === 0) {
    return [];
  }

  const entities: EntityReference[] = [];

  for (const source of sources) {
    let sourceEntities: EntityReference[] = [];

    switch (source.type) {
      case 'step':
        // Get entities from a specific step in accumulatedData
        if (source.index !== undefined) {
          const stepData = accumulatedData[source.index];
          if (stepData) {
            sourceEntities = stepData.entities || [];
          }
        }
        break;
      case 'turn':
        // Get entities from a specific conversation turn
        if (source.index !== undefined && state.conversationHistory) {
          const turn = state.conversationHistory[source.index];
          if (turn) {
            sourceEntities = turn.entities || [];
          }
        }
        break;
    }

    // Filter by entity type if specified
    if (source.entityTypes?.length) {
      sourceEntities = sourceEntities.filter(e => source.entityTypes!.includes(e.type));
    }

    entities.push(...sourceEntities);
  }

  // Dedupe by type+id
  const seen = new Set<string>();
  return entities.filter(e => {
    const key = `${e.type}:${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/**
 * Execute a single step and return the result
 */
async function executeStep(
  step: PlanStep,
  state: CampaignAnalysisState,
  agents: AgentContext,
  accumulatedData: AccumulatedDataItem[]
): Promise<AccumulatedDataItem | null> {
  const startTime = Date.now();

  // Resolve entities from specified sources (or empty if none specified)
  const resolvedEntities = resolveEntities(step, state, accumulatedData);

  try {
    switch (step.type) {
      case 'drilldown': {
        console.log(`  📊 Drilldown: ${step.reason}`);
        const modifiedState = {
          ...state,
          question: step.instruction,
          entities: resolvedEntities,  // No fallback - explicit only
        };
        const result = await agents.drilldownAgent.execute(modifiedState as CampaignAnalysisState);
        // Extract entities from ALL groupBy dimensions
        //const groupBy = result.drilldownData?.[0] ? Object.keys(result.drilldownData[0]).filter(k => k === 'ID' || k === 'Name') : [];
        const entities = extractEntitiesFromData(
          result.drilldownData || [],
          result.extractedParams?.dimension || 'Campaign'
        );
        // Debug logging happens inside drilldown-agent.ts
        return {
          type: 'drilldown',
          instruction: step.instruction,
          reason: step.reason,
          data: result.drilldownData,
          entities,
          dateRange: result.dateRange,
          timestamp: startTime,
        };
      }

      case 'trend': {
        // Trend queries use DrilldownAgent with 'trend' step type
        console.log(`  📈 Trend: ${step.reason}`);
        const modifiedState = {
          ...state,
          question: step.instruction,
          entities: resolvedEntities,  // No fallback - explicit only
        };
        const result = await agents.drilldownAgent.execute(modifiedState as CampaignAnalysisState, 'trend');
        // Extract entities from entity dimension (second element of groupBy for trends)
        const entityDimension = result.extractedParams?.dimension || 'Campaign';
        const entities = extractEntitiesFromData(
          result.drilldownData || [],
          entityDimension
        );
        return {
          type: 'drilldown' as const,
          instruction: step.instruction,
          reason: step.reason,
          data: result.drilldownData,
          entities,
          dateRange: result.dateRange,
          timestamp: startTime,
        };
      }

      case 'entity_lookup': {
        console.log(`  🔍 Entity lookup: ${step.reason}`);
        // Entity lookup typically doesn't need resolved entities - it's usually the first step
        const modifiedState = {
          ...state,
          question: step.instruction,
          entities: resolvedEntities,  // No fallback - explicit only
        };
        const result = await agents.entityLookupAgent.lookup(modifiedState as CampaignAnalysisState);
        // Debug logging happens inside entity-lookup-agent.ts
        return {
          type: 'entity_lookup',
          instruction: step.instruction,
          reason: step.reason,
          data: result.entityLookupData,
          entities: result.entities || [],
          timestamp: startTime,
        };
      }

      default:
        console.log(`  ⚠️ Unknown step type: ${(step as any).type}`);
        return null;
    }
  } catch (error) {
    console.error(`  ❌ Step failed: ${step.reason}`, error);
    return null;
  }
}
