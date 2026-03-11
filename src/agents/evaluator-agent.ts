import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { CampaignAnalysisState, formatConversationHistory } from '../types/state';
import { EVALUATOR_AGENT_PROMPT } from '../prompts/evaluator-agent-prompt';
import { logEvaluation } from '../utils/debug-logger';
import { countEntityRows } from '../utils/count-entity-rows';

const EvaluationResultSchema = z.object({
  decision: z.enum(['summarize', 'replan']).describe('What action to take'),
  confidence: z.number().min(0).max(1).describe('Confidence in decision (0-1)'),
  reasoning: z.string().describe('Brief explanation'),
  missingData: z.array(z.object({
    type: z.enum(['drilldown', 'trend', 'entity_lookup']),
    reason: z.string().describe('Natural language description of what data is needed'),
  })).nullable().describe('Data to request if decision is replan'),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// Configurable max cycles (3 to support entity_lookup → drilldown chains)
const MAX_CYCLES = 3;

/**
 * Evaluator Agent
 * Decides if accumulated data is sufficient to answer the user's question
 * If not, suggests what additional data is needed (max 2 cycles)
 */
export class EvaluatorAgent {
  private llmWithStructuredOutput: any;

  constructor(modelName: string = 'gpt-4o-mini') {
    const llm = new ChatOpenAI({ modelName, temperature: 0 });
    this.llmWithStructuredOutput = llm.withStructuredOutput(EvaluationResultSchema);
  }

  async evaluate(state: CampaignAnalysisState): Promise<Partial<CampaignAnalysisState>> {
    const startTime = Date.now();
    const cycleCount = state.planningCycleCount || 1;

    try {
      const chatHistory = state.conversationHistory 
        ? formatConversationHistory(state.conversationHistory)
        : '';

      // Summarize accumulated data for the LLM - include instruction so evaluator can detect duplicates
      const accumulatedSummary = (state.accumulatedData || []).map((d, i) => {
        const planStep = state.executionPlan?.plan?.[i];
        const entityRowCount = countEntityRows(d.data);

        return {
          type: d.type,
          instruction: d.instruction || planStep?.instruction || 'unknown',  // What was requested
          reason: d.reason || planStep?.reason || 'unknown',  // Use stored reason first
          dataSize: entityRowCount,  // 0 = no entity data, number = row count
          entities: d.entities || [],
        };
      });

      // Include plan info so evaluator knows what was requested
      const planInfo = (state.executionPlan?.plan || []).map(step => ({
        type: step.type,
        reason: step.reason,
      }));

      const userMessage = `Question: ${state.question}

Plan that was executed (${planInfo.length} steps):
${JSON.stringify(planInfo, null, 2)}

Accumulated Data (${accumulatedSummary.length} datasets):
${JSON.stringify(accumulatedSummary, null, 2)}

${chatHistory ? `Chat History:\n${chatHistory}` : 'No chat history'}

cycleCount: ${cycleCount}, maxCycles: ${MAX_CYCLES}`;

      const parsed = await this.llmWithStructuredOutput.invoke([
        { role: 'system', content: EVALUATOR_AGENT_PROMPT },
        { role: 'user', content: userMessage },
      ]) as EvaluationResult;

      const duration = Date.now() - startTime;
      const confidence = parsed.confidence;
      const decision = parsed.decision;

      console.log(`🔍 Evaluation (cycle ${cycleCount}): ${decision === 'summarize' ? '✅ Summarize' : '🔄 Replan'} (confidence: ${confidence.toFixed(2)})`);
      console.log(`   Reasoning: ${parsed.reasoning}`);

      if (confidence < 0.7) {
        console.log(`   ⚠️  Low confidence evaluation - results may be incomplete`);
      }

      if (decision === 'replan' && parsed.missingData) {
        console.log(`   Missing: ${parsed.missingData.map(m => m.type).join(', ')}`);
      }

      // Build structured input for debug logs
      const structuredInput = {
        question: state.question,
        planExecuted: planInfo,
        accumulatedData: accumulatedSummary,
        chatHistory: chatHistory || null,
        cycleCount,
        maxCycles: MAX_CYCLES,
      };

      // Log evaluation for debugging (include structured LLM input)
      logEvaluation(cycleCount, { decision, confidence, reasoning: parsed.reasoning, missingData: parsed.missingData }, cycleCount >= MAX_CYCLES, structuredInput);

      return {
        evaluationResult: { decision, confidence, reasoning: parsed.reasoning, missingData: parsed.missingData },
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          timings: [
            ...(state.metadata.timings || []),
            { step: 'evaluator', type: 'llm', duration, timestamp: startTime },
          ],
        },
      };
    } catch (error) {
      console.error('❌ Evaluator error:', error);
      
      // Log error for debugging
      logEvaluation(
        state.planningCycleCount || 1,
        {
          decision: 'summarize',
          confidence: 0,
          reasoning: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          missingData: null
        },
        false,
        { question: state.question, error: error instanceof Error ? error.message : 'Unknown error' } as any
      );

      // On error, summarize to avoid infinite loops
      return {
        evaluationResult: { 
          decision: 'summarize',
          confidence: 0.5,  // Low confidence due to error
          reasoning: 'Evaluation failed, proceeding with available data',
          missingData: null 
        },
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
        },
      };
    }
  }
}
