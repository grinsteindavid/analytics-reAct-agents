import { CampaignAnalysisState } from '../../types/state';

/**
 * Route after intent classification
 * Determines next node based on intent
 * 
 * Simplified routing (v3 - 2 main paths):
 * - analytics/metadata_only → create_plan (Planner handles all data queries including entity lookups)
 * - non_analytics → generate_summary (system capabilities, off-topic, explanations)
 */
export function routeAfterClassify(state: CampaignAnalysisState): string {
  const { intent } = state;
  
  console.log(`🔀 Routing based on intent: ${intent}`);

  switch (intent) {
    case 'analytics':
    case 'metadata_only':
      // Route ALL data queries to Planner - Planner handles entity resolution from conversationHistory
      console.log(`📋 ${intent} query - routing to Planner`);
      return 'create_plan';

    case 'non_analytics':
    default:
      // System capabilities, off-topic, or explanations - route to summary
      console.log('💬 Non-analytics - routing to summary');
      return 'generate_summary';
  }
}
