/**
 * analytics-react-agents
 * LangGraph ReAct AI analytics agent for natural language Q&A over campaign data
 */

// Workflows
export { AnalyticsWorkflow } from './workflows/analytics';
export { getAnalyticsWorkflow, destroyWorkflowInstance, isWorkflowInitialized } from './workflows/analytics/singleton';

// Agents
export { IntentClassifierAgent } from './agents/intent-classifier';
export { DrilldownAgent } from './agents/drilldown-agent';
export type { DrilldownStepType } from './agents/drilldown-agent';
export { SummaryAgent } from './agents/summary-agent';
export { EntityLookupAgent } from './agents/entity-lookup-agent';
export { PlannerAgent } from './agents/planner-agent';
export { EvaluatorAgent } from './agents/evaluator-agent';

// Tools
export { createDrilldownTool } from './tools/drilldown-tool';
export { createCampaignLookupTool } from './tools/campaign-lookup-tool';
export { createTrafficSourceLookupTool } from './tools/traffic-source-lookup-tool';
export { createGenericEntityLookupTool } from './tools/generic-entity-lookup-tool';

// Types
export type { DatabaseContext, WorkflowContext } from './types/context';
export type { CampaignAnalysisState, CreateInitialStateOptions, QueryContext, ConversationTurn, PlanStep, EntitySource } from './types/state';
export { createInitialState, formatConversationHistory } from './types/state';
export type { EntityReference, EntityType } from './types/entity';
export {
    extractEntitiesFromData,
    extractEntitiesFromDocuments,
    mergeEntities,
    filterEntitiesByType,
    getEntityIds,
    formatEntitiesForContext,
} from './types/entity';
export type {
    ChatMessage,
    ChatMessageData,
    ChatSession,
    WorkflowExecutionOptions,
    TracingOptions,
} from './types/chat';

// Utils
// ChatHistoryManager removed - using checkpointer for state persistence
export { initLLMCache, getLLMCache, isLLMCacheInitialized } from './utils/llm-cache';

// Prompts
export {
    INTENT_CLASSIFIER_SIMPLE_PROMPT,
    DRILLDOWN_AGENT_PROMPT,
    TREND_ANALYSIS_AGENT_PROMPT, // Still exported for DrilldownAgent's trend mode
    SUMMARY_GENERATOR_PROMPT,
} from './prompts';

// Constants
export {
    GROUP_BY_DIMENSIONS,
    FILTER_TYPES,
    METRIC_NAMES,
    CONDITION_TYPES,
    DATE_RANGE_PRESETS,
} from './constants';
export type {
    GroupByDimension,
    FilterType,
    MetricName,
    ConditionType,
    DateRangePresetType,
} from './constants';
