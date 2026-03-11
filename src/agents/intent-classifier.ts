import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { INTENT_CLASSIFIER_SIMPLE_PROMPT } from '../prompts/intent-classifier-simple';
import { CampaignAnalysisState, formatConversationHistory } from '../types/state';
import { logIntentClassification } from '../utils/debug-logger';

/**
 * Intent classification schema (v3 - 3 intents + follow-up detection)
 * analytics → Planner (handles drilldown, trend, follow-up, entity lookups)
 * metadata_only → EntityLookupAgent (pure listing, no metrics)
 * non_analytics → Summary (system capabilities, off-topic, explanations)
 */
const IntentClassificationSchema = z.object({
  intent: z.enum([
    'analytics',
    'metadata_only',
    'non_analytics'
  ]),
  isFollowUp: z.boolean().describe('True if question references previous results (their, those, same campaigns, etc.)'),
  confidence: z.number().min(0).max(1).describe('Confidence in classification (0-1). Lower if question is ambiguous or could fit multiple intents.'),
  ambiguityReason: z.string().optional().describe('Brief explanation if confidence < 0.8'),
});

/**
 * Intent Classifier Agent
 * ONLY classifies intent - no entity extraction
 * Entity extraction happens in tool-specific agents
 */
export class IntentClassifierAgent {
  private llmWithStructuredOutput: any;

  constructor(modelName: string = 'gpt-4o-mini') {
    const llm = new ChatOpenAI({
      modelName,
      temperature: 0,
    });
    this.llmWithStructuredOutput = llm.withStructuredOutput(IntentClassificationSchema);
  }

  async classify(state: CampaignAnalysisState): Promise<Partial<CampaignAnalysisState>> {
    try {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: INTENT_CLASSIFIER_SIMPLE_PROMPT },
      ];

      // Add conversation history context if available
      const formattedHistory = formatConversationHistory(state.conversationHistory);
      if (formattedHistory) {
        messages.push({
          role: 'user',
          content: `Previous conversation:\n${formattedHistory}\n\nNew question: ${state.question}`,
        });
      } else {
        messages.push({ role: 'user', content: state.question });
      }

      const parsed = await this.llmWithStructuredOutput.invoke(messages) as any;

      // Debug logging (writes to debug-logs session folder)
      const llmInput = {
        question: state.question,
        conversationHistory: formattedHistory || null,
      };
      logIntentClassification(llmInput, parsed);

      if (process.env.DEBUG === 'true') {
        console.log('🤖 Intent Classifier Response:', JSON.stringify(parsed, null, 2));
      }

      // Log confidence for observability
      if (parsed.confidence < 0.8) {
        console.log(`⚠️  Low intent confidence: ${parsed.confidence.toFixed(2)} - ${parsed.ambiguityReason || 'no reason provided'}`);
      }

      return {
        intent: parsed.intent,
        isFollowUp: parsed.isFollowUp || false,
        intentConfidence: parsed.confidence,
        intentAmbiguityReason: parsed.ambiguityReason,
        entities: [], // No entity extraction - agents handle this
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
        },
      };
    } catch (error) {
      console.error('Intent classification error:', error);
      // Log error for debugging
      logIntentClassification(
        { question: state.question, error: error instanceof Error ? error.message : 'Unknown error' },
        { intent: 'non_analytics', isFollowUp: false, confidence: 0 }
      );
      return {
        intent: 'non_analytics',
        error: error instanceof Error ? error.message : 'Classification failed',
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
        },
      };
    }
  }
}
