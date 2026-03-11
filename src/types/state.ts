import { EntityReference, EntityType } from './entity';

/**
 * Entity source specification for precise entity filtering
 * Allows agents to pick entities from specific sources instead of merging all
 */
export interface EntitySource {
  type: 'step' | 'turn';
  index: number;               // REQUIRED: step=accumulatedData index, turn=conversationHistory index
  entityTypes?: EntityType[] | null;  // Optional filter by entity type
}

/**
 * Plan step - each step executes independently
 * Dependencies between steps are handled via cycles (Evaluator triggers next cycle)
 */
export interface PlanStep {
  type: 'drilldown' | 'trend' | 'entity_lookup';
  instruction: string;
  reason: string;
  entitySources?: EntitySource[] | null;  // Array of sources to pick entities from (empty = no filtering)
}

/**
 * Query context persisted in checkpointer for follow-up questions
 * Contains the exact query sent and entities for context inheritance
 */
export interface QueryContext {
  // The query that was executed
  query: {
    filters: Array<{ type: string; ids: string[] }>;
    groupBy: string | string[];
    sort: string;
    direction: 'asc' | 'desc';
    limit: number;
    dateRange: { from: string; to: string };
    conditions?: Array<{
      metric: string;
      type: 'Is Greater Than' | 'Is Less Than' | 'Equal To' | 'Greater Than or Equal To' | 'Less Than or Equal To';
      value: number;
    }>;
  };
  
  // Unified entity references (replaces entityIds)
  entities: EntityReference[];
  
  // Response metadata (not the data itself)
  responseMetadata: {
    totalRows: number;
    groupBy: string | string[];
    metricsIncluded: string[];
  };
}

/**
 * Conversation turn stored in checkpoint for multi-turn context
 * Entities and metrics are merged from all parallel steps in the turn
 */
export interface ConversationTurn {
  question: string;
  intent: string;
  summary: string;
  timestamp: number;
  // Merged entities from all steps in this turn (deduplicated by type+id)
  entities: EntityReference[];
  // Merged metrics from all steps (for Planner to know what was already fetched)
  metricsIncluded?: string[];
  // Date range used in this turn (for follow-up date inheritance)
  dateRange?: { from: string; to: string };
  // Confidence tracking for multi-turn awareness
  confidence?: number;           // 0-1 scale, overall response confidence
  uncertaintyReasons?: string[]; // Why confidence was low (data gaps, ambiguity, etc.)
}

/**
 * LangGraph state for campaign analysis workflow
 * 
 * PERSISTED (in checkpointer): question, intent, conversationHistory, result
 * TRANSIENT (not persisted): drilldownData, entityLookupData, entities (pass-through only)
 */
export interface CampaignAnalysisState {
  // === PERSISTED: Core workflow state ===
  
  // Current question
  question: string;
  
  // Current date/time for date calculations (set at workflow start)
  currentDateTime: string;

  // Intent classification (v3 - simplified to 3 intents)
  // analytics → Planner (handles drilldown, trend, follow-up, entity lookups)
  // metadata_only → EntityLookupAgent (pure listing, no metrics)
  // non_analytics → Summary (system capabilities, off-topic, explanations)
  intent: 'analytics' | 'metadata_only' | 'non_analytics';

  // Whether this question references previous results (determined by LLM)
  // Used to preserve entities from previous turn for follow-up questions
  isFollowUp?: boolean;

  // Intent classification confidence (0-1)
  // Lower values indicate ambiguous questions that could fit multiple intents
  intentConfidence?: number;
  intentAmbiguityReason?: string;

  // Transient entity references - passed from execute-plan to agents
  // NOT persisted. For follow-ups, use entitySources to reference conversationHistory[i].entities
  entities?: EntityReference[];

  // Extracted query parameters from question (kept for backward compat)
  extractedParams: {
    sortMetric?: 'Revenue' | 'Spent' | 'Profit' | 'ROI%' | 'Clicks' | 'CVRs' | 'CR%' | 'CTR%' |
      'OfferClicks' | 'OfferViews' | 'EPC' | 'CPC';
    sortOrder?: 'asc' | 'desc';
    metricsSelection?: string[];
    dimension?: 'Campaign' | 'TrafficSource' | 'Offer' | 'Affiliate' | 'Country' | 'Device' | 'Date';
    limit?: number;
    trafficSource?: string;
    status?: 'active' | 'not_active' | 'any';
    dateRange?: string;
    conditions?: Array<{
      metric: string;
      type: 'Is Greater Than' | 'Is Less Than' | 'Equal To' | 'Greater Than or Equal To' | 'Less Than or Equal To';
      value: number;
    }>;
  };
  
  // DEPRECATED: queryContext removed - use conversationHistory[i].entities and metricsIncluded instead
  // queryContext?: QueryContext;
  
  // Conversation history for multi-turn context (persisted)
  conversationHistory?: ConversationTurn[];
  
  // Execution plan from Planner Agent (transient - not persisted)
  // Supports parallel execution at root level with sequential 'next' chains
  executionPlan?: {
    plan: PlanStep[];
    reasoning: string;
  };

  // Planning cycle count (max 2 cycles allowed)
  planningCycleCount?: number;

  // Evaluation result from Evaluator Agent (transient)
  evaluationResult?: {
    decision: 'summarize' | 'replan';  // What action to take
    confidence: number;  // 0-1 scale - how confident evaluator is in decision
    reasoning: string;
    missingData: Array<{
      type: 'drilldown' | 'trend' | 'entity_lookup';
      reason: string;
    }> | null;
  };

  // Final result (persisted)
  result?: {
    summary: string;
    keyInsights: string[] | null;
    confidence?: number;  // 0-1 scale - overall response confidence
    uncertaintyReasons?: string[];  // Why confidence is low (data gaps, ambiguity, etc.)
    dataIncomplete?: boolean;
    totalRows?: number;
  };
  
  // Accumulated data from multiple tool calls (for multi-tool orchestration)
  // Note: 'trend' removed - trend queries now go through drilldown with time_dimension
  // Entities are stored per-step and merged into conversationHistory at turn end
  accumulatedData?: Array<{
    type: 'drilldown' | 'entity_lookup';
    instruction: string;
    reason: string;
    data: any;
    entities: EntityReference[];
    dateRange?: { from: string; to: string };
    timestamp: number;
  }>;

  // Error state
  error?: string;
  
  // === TRANSIENT: Large data not persisted in checkpointer ===
  
  // Raw data from tools (filtered to selected metrics)
  drilldownData?: any[];
  
  // Entity lookup results (replaces campaignDetails, trafficSourceDetails)
  entityLookupData?: any[];
  
  // Date range from last drilldown (transient, used for passing to accumulatedData)
  dateRange?: { from: string; to: string };

  // === METADATA ===
  
  metadata: {
    llmCalls: number;
    toolCalls: number;
    startTime: number;
    endTime?: number;
    sessionId?: string;
    timings?: Array<{
      step: string;
      type: 'llm' | 'tool' | 'node';
      duration: number;
      timestamp: number;
    }>;
  };
}

/**
 * Options for creating initial state
 */
export interface CreateInitialStateOptions {
  sessionId?: string;
  // Previous state from checkpointer (for Turn 2+)
  previousState?: Partial<CampaignAnalysisState>;
}

/**
 * Initial state factory
 * Merges previous state from checkpointer for multi-turn conversations
 */
export function createInitialState(
  question: string,
  options?: CreateInitialStateOptions
): CampaignAnalysisState {
  const prev = options?.previousState;

  return {
    question,
    currentDateTime: new Date().toISOString(),
    intent: 'non_analytics',
    // entities is transient - NOT inherited. Use entitySources to reference conversationHistory
    entities: undefined,
    extractedParams: {},
    // conversationHistory is the ONLY persisted context for follow-ups
    conversationHistory: prev?.conversationHistory,
    // RESET transient fields each turn (not inherited from previous state)
    planningCycleCount: 0,
    executionPlan: undefined,
    evaluationResult: undefined,
    accumulatedData: [],  // Explicitly empty array to reset (reducer appends)
    metadata: {
      llmCalls: 0,
      toolCalls: 0,
      startTime: Date.now(),
      sessionId: options?.sessionId,
      timings: [],
    },
  };
}

// Re-export formatConversationHistory from dedicated util for backward compatibility
export { formatConversationHistory } from '../utils/format-conversation-history';
