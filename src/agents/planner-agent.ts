import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { CampaignAnalysisState, PlanStep, formatConversationHistory } from '../types/state';
import { PLANNER_AGENT_PROMPT } from '../prompts/planner-agent-prompt';
import { logExecutionPlan } from '../utils/debug-logger';
import { countEntityRows } from '../utils/count-entity-rows';

// EntityType values from entity.ts — must stay in sync
const EntityTypeEnum = z.enum([
  'Campaign', 'TrafficSource', 'Offer', 'Affiliate',
  'Device', 'Browser', 'OS', 'Country', 'LandingPage', 'Rotation'
]);

const PlanStepSchema = z.object({
  type: z.enum(['drilldown', 'trend', 'entity_lookup']).describe('Type of data to fetch'),
  instruction: z.string().describe('Natural language instruction for the agent'),
  reason: z.string().describe('Why this data is needed'),
  entitySources: z.array(z.object({
    type: z.enum(['step', 'turn']),
    index: z.number(),
    entityTypes: z.array(EntityTypeEnum).optional(),
  })).optional().describe('Where to get entity filters from'),
});

const ExecutionPlanSchema = z.object({
  plan: z.array(PlanStepSchema).describe('List of steps to execute'),
  reasoning: z.string().describe('Brief explanation of the plan'),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// Re-export PlanStep for backward compatibility
export type { PlanStep };

/**
 * Planner Agent
 * Analyzes user question and creates execution plan UPFRONT
 * No loops - decides what data is needed before any fetching
 */
export class PlannerAgent {
  private llmWithStructuredOutput: any;

  constructor(modelName: string = 'gpt-4o-mini') {
    const llm = new ChatOpenAI({ modelName, temperature: 0 });
    this.llmWithStructuredOutput = llm.withStructuredOutput(ExecutionPlanSchema);
  }

  async createPlan(state: CampaignAnalysisState): Promise<Partial<CampaignAnalysisState>> {
    const startTime = Date.now();
    const cycleCount = state.planningCycleCount || 1;

    try {
      const chatHistory = state.conversationHistory
        ? formatConversationHistory(state.conversationHistory)
        : '';

      // Summarize accumulated data for cycle 2
      // Include entities so Planner can pass them in instructions for filtered queries
      const accumulatedSummary = (state.accumulatedData || []).map(d => {
        return {
          type: d.type,
          dataSize: countEntityRows(d.data),  // 0 = no entity data
          entities: d.entities || [], // Include entities for chained queries
        };
      });

      // Get metrics from last conversation turn (for follow-up context)
      const lastTurn = state.conversationHistory?.length
        ? state.conversationHistory[state.conversationHistory.length - 1]
        : null;
      const previousMetrics = lastTurn?.metricsIncluded || [];

      // Include evaluator hint on replan cycles (not first plan)
      // This helps planner know what data the evaluator thinks is missing
      const evaluatorHint = cycleCount > 1 && state.evaluationResult?.missingData
        ? state.evaluationResult.missingData
        : null;

      const userMessage = `Question: ${state.question}
${chatHistory ? `\nChat History:\n${chatHistory}` : ''}
${previousMetrics.length > 0 ? `\nPrevious Turn Metrics: ${previousMetrics.join(', ')}` : ''}
${accumulatedSummary.length > 0 ? `\nAccumulated Data (already fetched):\n${JSON.stringify(accumulatedSummary, null, 2)}` : ''}
${evaluatorHint ? `\nEvaluator Suggestion (validate before using):\n${JSON.stringify(evaluatorHint, null, 2)}` : ''}
Cycle Count: ${cycleCount}
Current DateTime: ${state.currentDateTime}`;

      const parsed = await this.llmWithStructuredOutput.invoke([
        { role: 'system', content: PLANNER_AGENT_PROMPT },
        { role: 'user', content: userMessage },
      ]) as ExecutionPlan;

      console.log(`📋 Execution Plan (${parsed.plan.length} steps): ${parsed.reasoning}`);
      parsed.plan.forEach((step, i) => {
        console.log(`   ${i + 1}. ${step.type}: ${step.reason}`);
      });

      // Build structured input for debug logs
      const structuredInput = {
        question: state.question,
        chatHistory: chatHistory || null,
        previousMetrics: previousMetrics.length > 0 ? previousMetrics : null,
        accumulatedData: accumulatedSummary,
        evaluatorHint: evaluatorHint || null,
        cycleCount,
        currentDateTime: state.currentDateTime,
      };

      // Log execution plan to debug files (include structured LLM input)
      logExecutionPlan(cycleCount, parsed.plan, parsed.reasoning, accumulatedSummary, structuredInput);

      const duration = Date.now() - startTime;

      return {
        executionPlan: parsed,
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          timings: [
            ...(state.metadata.timings || []),
            { step: 'planner', type: 'llm', duration, timestamp: startTime },
          ],
        },
      };
    } catch (error) {
      console.error('❌ Planner error:', error);

      // Log error for debugging
      logExecutionPlan(
        state.planningCycleCount || 1,
        [],
        `Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [],
        { question: state.question, error: error instanceof Error ? error.message : 'Unknown error' } as any
      );

      // Fallback: empty plan (will go straight to summary)
      return {
        executionPlan: { plan: [], reasoning: 'Planning failed, proceeding with available data' },
        error: error instanceof Error ? error.message : 'Planning failed',
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
        },
      };
    }
  }
}
