import { CampaignAnalysisState } from '../../../types/state';
import { IntentClassifierAgent } from '../../../agents/intent-classifier';

/**
 * Classify Intent Node
 * Determines user intent and extracts entities from the question
 */
export async function classifyIntent(
  state: CampaignAnalysisState,
  intentClassifier: IntentClassifierAgent
): Promise<Partial<CampaignAnalysisState>> {
  console.log('🔍 Classifying intent...');
  const startTime = Date.now();
  
  const result = await intentClassifier.classify(state);
  const duration = Date.now() - startTime;
  
  const isFollowUp = result.isFollowUp || false;
  console.log(`✅ Intent: ${result.intent}, Follow-up: ${isFollowUp} (${duration}ms)`);
  
  // Note: Debug logging happens inside intent-classifier agent
  // NOTE: Entity preservation removed - Planner uses entitySources to explicitly
  // reference conversationHistory[i].entities for follow-up queries

  return {
    ...result,
    // entities is transient - not inherited. Planner uses entitySources for follow-ups
    metadata: {
      llmCalls: result.metadata?.llmCalls || state.metadata.llmCalls,
      toolCalls: result.metadata?.toolCalls || state.metadata.toolCalls,
      startTime: state.metadata.startTime,
      endTime: result.metadata?.endTime,
      timings: [
        ...(state.metadata.timings || []),
        { step: 'classify', type: 'llm' as const, duration, timestamp: startTime },
      ],
    },
  };
}
