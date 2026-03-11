import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { DocumentDBCheckpointer } from '../../utils/mongodb-checkpointer';
import {
  CampaignAnalysisState,
  createInitialState,
  CreateInitialStateOptions,
  formatConversationHistory,
  ConversationTurn,
} from '../../types/state';
import { WorkflowExecutionOptions } from '../../types/chat';
import {
  startExecution,
  endExecution,
  logStateInitial,
  logStateAfterTools,
  logStateFinal
} from '../../utils/debug-logger';
import { DatabaseContext } from '../../types/context';
import { IntentClassifierAgent } from '../../agents/intent-classifier';
import { DrilldownAgent } from '../../agents/drilldown-agent';
import { SummaryAgent } from '../../agents/summary-agent';
import { PlannerAgent } from '../../agents/planner-agent';
import { EvaluatorAgent } from '../../agents/evaluator-agent';
import { EntityLookupAgent } from '../../agents/entity-lookup-agent';
import { EntityReference, mergeEntities } from '../../types/entity';
// Import nodes
import { classifyIntent } from './nodes/classify-intent';
import { generateSummary } from './nodes/generate-summary';
import { executePlan } from './nodes/execute-plan';
import { executeEntityLookup } from './nodes/execute-entity-lookup';
// Import routing
import { routeAfterClassify } from './routing';

/**
 * Analytics Workflow
 * LangGraph state machine for answering analytics questions
 * 
 * Simplified Flow (v2 - unified entity model):
 * 1. Classify intent → determines path
 * 2. All analytics queries go through Planner flow:
 *    create_plan → execute_plan → evaluate → generate_summary
 * 3. Entity lookups (campaign_details, traffic_source_details) use EntityLookupAgent
 * 4. Return result with AI-generated summary
 * 
 * Key changes:
 * - Removed separate campaign/traffic source filter nodes
 * - Unified entity model (EntityReference[]) replaces campaignIds/trafficSourceIds
 * - All entity lookups go through single EntityLookupAgent
 */

/**
 * Merge entities from all accumulated data steps (parallel-safe)
 * Deduplicates by type+id
 */
function mergeEntitiesFromAccumulatedData(accumulatedData: CampaignAnalysisState['accumulatedData']): EntityReference[] {
  if (!accumulatedData || accumulatedData.length === 0) return [];

  let merged: EntityReference[] = [];
  for (const step of accumulatedData) {
    if (step.entities?.length) {
      merged = mergeEntities(merged, step.entities);
    }
  }
  return merged;
}

/**
 * Collect metricsIncluded from all drilldown steps
 * Deduplicates metrics
 */
function collectMetricsFromAccumulatedData(accumulatedData: CampaignAnalysisState['accumulatedData']): string[] {
  if (!accumulatedData || accumulatedData.length === 0) return [];

  const metricsSet = new Set<string>();
  for (const step of accumulatedData) {
    if (step.type === 'drilldown' && step.data?.length > 0) {
      // Extract metric names from first row of data (columns that aren't ID/Name/Date)
      const firstRow = step.data[0];
      const excludeKeys = ['ID', 'Name', 'Date', 'Total'];
      for (const key of Object.keys(firstRow)) {
        if (!excludeKeys.includes(key)) {
          metricsSet.add(key);
        }
      }
    }
  }
  return Array.from(metricsSet);
}

/**
 * Collect dateRange from first drilldown step that has one
 * Used for follow-up date context inheritance
 */
function collectDateRangeFromAccumulatedData(
  accumulatedData: CampaignAnalysisState['accumulatedData']
): { from: string; to: string } | undefined {
  if (!accumulatedData || accumulatedData.length === 0) return undefined;

  for (const step of accumulatedData) {
    if (step.type === 'drilldown' && step.dateRange) {
      return step.dateRange;
    }
  }
  return undefined;
}

export class AnalyticsWorkflow {
  private compiledGraph: any;
  private intentClassifier: IntentClassifierAgent;
  private plannerAgent: PlannerAgent;
  private evaluatorAgent: EvaluatorAgent;
  private drilldownAgent: DrilldownAgent;
  private summaryAgent: SummaryAgent;
  private entityLookupAgent: EntityLookupAgent;
  private context: DatabaseContext;
  private checkpointer: DocumentDBCheckpointer;

  constructor(context: DatabaseContext, modelName: string = 'gpt-4o-mini') {
    this.context = context;
    this.intentClassifier = new IntentClassifierAgent(modelName);
    this.plannerAgent = new PlannerAgent(modelName);
    this.evaluatorAgent = new EvaluatorAgent(modelName);
    this.drilldownAgent = new DrilldownAgent(context, modelName);
    this.summaryAgent = new SummaryAgent(modelName);
    this.entityLookupAgent = new EntityLookupAgent(context, modelName);

    // Initialize custom checkpointer for DocumentDB compatibility
    if (!context.mongooseConnection) {
      throw new Error('mongooseConnection is required for workflow state persistence');
    }
    this.checkpointer = new DocumentDBCheckpointer(context.mongooseConnection);

    // Define state annotation for LangGraph
    // Note: Only persisted fields are stored in checkpointer
    const StateAnnotation = Annotation.Root({
      // Persisted fields
      question: Annotation<string>(),
      currentDateTime: Annotation<string>(),
      intent: Annotation<CampaignAnalysisState['intent']>(),
      extractedParams: Annotation<CampaignAnalysisState['extractedParams']>(),
      conversationHistory: Annotation<ConversationTurn[] | undefined>(),
      // Transient entity pass-through (NOT persisted - use conversationHistory for follow-ups)
      entities: Annotation<EntityReference[] | undefined>(),
      result: Annotation<CampaignAnalysisState['result']>(),
      error: Annotation<string>(),
      // Confidence tracking (persisted for observability)
      intentConfidence: Annotation<number | undefined>(),
      intentAmbiguityReason: Annotation<string | undefined>(),
      // Transient fields (large data, NOT persisted in checkpointer)
      drilldownData: Annotation<any[]>(),
      entityLookupData: Annotation<any[]>(),
      // Planner output: execution plan (transient)
      executionPlan: Annotation<CampaignAnalysisState['executionPlan']>(),
      // Planning cycle count for bounded loops (max 2)
      planningCycleCount: Annotation<number>(),
      // Evaluator result (transient)
      evaluationResult: Annotation<CampaignAnalysisState['evaluationResult']>(),
      // Accumulated data from plan execution - APPEND within turn, RESET between turns
      // If incoming is empty array [], it signals a new turn - reset instead of append
      accumulatedData: Annotation<CampaignAnalysisState['accumulatedData']>({
        reducer: (existing, incoming) => {
          // Empty array signals reset (new turn) - don't append to previous turn's data
          if (Array.isArray(incoming) && incoming.length === 0) {
            return [];
          }
          // Otherwise append within the same turn
          return [...(existing || []), ...(incoming || [])];
        },
        default: () => [],
      }),
      metadata: Annotation<CampaignAnalysisState['metadata']>(),
    });

    const graph = new StateGraph(StateAnnotation);
    this.buildGraph(graph);
  }

  private buildGraph(graph: any) {
    // Add all nodes
    graph.addNode('classify', (state: any) => classifyIntent(state, this.intentClassifier));

    // === BOUNDED HYBRID PLANNER FLOW (max 2 cycles) ===
    // Planner: analyzes question and creates execution plan
    graph.addNode('create_plan', async (state: any) => {
      // Increment cycle count and RETURN it to state
      const cycleCount = (state.planningCycleCount || 0) + 1;
      console.log(`📋 Planning cycle ${cycleCount}/2`);
      const planResult = await this.plannerAgent.createPlan({ ...state, planningCycleCount: cycleCount });
      // CRITICAL: Return planningCycleCount so it persists in state
      return { ...planResult, planningCycleCount: cycleCount };
    });
    // Plan executor: runs all planned queries in parallel
    // DrilldownAgent handles both 'drilldown' and 'trend' step types
    graph.addNode('execute_plan', (state: any) => executePlan(state, {
      drilldownAgent: this.drilldownAgent,
      entityLookupAgent: this.entityLookupAgent,
    }));
    // Evaluator: decides if accumulated data is sufficient
    graph.addNode('evaluate', (state: any) => this.evaluatorAgent.evaluate(state));

    // Direct execution node for metadata_only intent
    graph.addNode('execute_entity_lookup', (state: any) => executeEntityLookup(state, this.entityLookupAgent));
    graph.addNode('generate_summary', (state: any) => generateSummary(state, this.summaryAgent));

    // Define edges
    graph.addEdge(START, 'classify');
    graph.addConditionalEdges('classify', routeAfterClassify, {
      execute_entity_lookup: 'execute_entity_lookup',
      create_plan: 'create_plan',
      generate_summary: 'generate_summary',
    });

    // === BOUNDED PLANNER FLOW ===
    // create_plan → execute_plan → evaluate → (re-plan if cycle<2 AND need more) → generate_summary
    graph.addEdge('create_plan', 'execute_plan');
    graph.addEdge('execute_plan', 'evaluate');
    graph.addConditionalEdges('evaluate', this.routeAfterEvaluate.bind(this), {
      create_plan: 'create_plan',
      generate_summary: 'generate_summary',
    });

    // Entity lookup → summary
    graph.addEdge('execute_entity_lookup', 'generate_summary');
    // Summary is FINAL - no loops
    graph.addEdge('generate_summary', END);

    // Compile graph with checkpointer for state persistence across turns
    this.compiledGraph = graph.compile({ checkpointer: this.checkpointer });
  }

  /**
   * Route after evaluation - confidence-based decision with bounded loops
   * 
   * Confidence thresholds:
   * - < 0.4: Can't improve via replan (empty data, wrong approach) → summarize
   * - 0.4-0.7: Might improve with more data → replan if cycles remain
   * - >= 0.7: Good enough → summarize
   */
  private routeAfterEvaluate(state: CampaignAnalysisState): string {
    const cycleCount = state.planningCycleCount || 1;
    const evaluation = state.evaluationResult;
    const confidence = evaluation?.confidence ?? 0.5;
    const maxCycles = 2;

    // Max cycles reached — always summarize
    if (cycleCount >= maxCycles) {
      console.log(`⚠️ Max cycles (${maxCycles}) reached - proceeding to summary with available data`);
      return 'generate_summary';
    }

    // Low confidence (< 0.4) = can't improve (e.g., no base data exists)
    if (confidence < 0.4) {
      console.log(`⚠️ Low confidence (${(confidence * 100).toFixed(0)}%) - replanning won't help, proceeding to summary`);
      return 'generate_summary';
    }

    // Use evaluator's decision (summarize or replan)
    if (evaluation?.decision === 'summarize' || confidence >= 0.7) {
      return 'generate_summary';
    }

    // Replan requested with cycles remaining
    console.log(`🔄 Re-planning with accumulated data (cycle ${cycleCount + 1}/${maxCycles}) - confidence: ${(confidence * 100).toFixed(0)}%`);
    return 'create_plan';
  }

  /**
   * Execute the workflow with a question
   * @param question - Natural language question
   * @param options - Optional execution options (sessionId, chatHistory, etc.)
   */
  async execute(
    question: string,
    options?: WorkflowExecutionOptions
  ): Promise<CampaignAnalysisState> {
    // Generate sessionId if not provided (required for checkpointer)
    const sessionId = options?.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Start debug execution logging
    startExecution(question, sessionId);

    console.log('\n🚀 Starting Analytics Workflow');
    console.log('📝 Question:', question);
    console.log('💬 Session:', sessionId);
    console.log('─'.repeat(80));

    // Load previous state from checkpointer for multi-turn conversations
    let previousState: Partial<CampaignAnalysisState> | undefined;

    if (options?.sessionId) {
      const checkpoint = await this.checkpointer.getTuple({
        configurable: { thread_id: options.sessionId },
      });

      if (checkpoint?.checkpoint) {
        // Extract previous state from checkpoint channel values
        const channelValues = (checkpoint.checkpoint as any).channel_values || {};

        previousState = {
          conversationHistory: channelValues.conversationHistory,
        };
        const historyLength = previousState.conversationHistory?.length || 0;
        console.log(`📜 Loaded previous state: ${historyLength} turns`);
      }
    }

    // Create initial state with previous context
    const stateOptions: CreateInitialStateOptions = {
      sessionId,
      previousState,
    };
    const initialState = createInitialState(question, stateOptions);

    // Log initial state for debugging
    logStateInitial(initialState);

    // Build LangSmith-compatible invoke config with tracing metadata
    // Tracing is automatically enabled when LANGSMITH_TRACING=true env var is set
    const sessionSuffix = sessionId.length >= 8 ? sessionId.slice(-8) : sessionId;
    const invokeConfig = {
      configurable: { thread_id: sessionId },
      runName: options?.tracing?.runName || `analytics-${sessionSuffix}`,
      metadata: {
        sessionId,
        userId: options?.userId,
        environment: process.env.LANGSMITH_ENVIRONMENT || 'development',
        ...options?.tracing?.metadata,
      },
      tags: ['analytics', ...(options?.tracing?.tags || [])],
    };
    const result = await this.compiledGraph.invoke(initialState, invokeConfig);

    // Set end time if not already set
    if (!result.metadata.endTime) {
      result.metadata.endTime = Date.now();
    }

    // Log state after tools executed
    logStateAfterTools(result);

    // Update conversation history in result for next turn
    if (result.result?.summary) {
      // Merge entities from all accumulated steps (parallel-safe)
      const mergedEntities = mergeEntitiesFromAccumulatedData(result.accumulatedData || []);
      // Collect metricsIncluded from all drilldown steps
      const metricsIncluded = collectMetricsFromAccumulatedData(result.accumulatedData || []);
      // Collect dateRange from drilldown steps for follow-up date inheritance
      const dateRange = collectDateRangeFromAccumulatedData(result.accumulatedData || []);

      const newTurn: ConversationTurn = {
        question,
        intent: result.intent,
        summary: result.result.summary,
        timestamp: Date.now(),
        entities: mergedEntities,
        metricsIncluded: metricsIncluded.length > 0 ? metricsIncluded : undefined,
        dateRange,
        confidence: result.result.confidence,
        uncertaintyReasons: result.result.uncertaintyReasons,
      };
      result.conversationHistory = [
        ...(result.conversationHistory || []),
        newTurn,
      ];

      // Persist updated state with conversation history to checkpointer
      const currentCheckpoint = await this.checkpointer.getTuple({
        configurable: { thread_id: sessionId },
      });

      if (currentCheckpoint?.checkpoint) {
        const updatedCheckpoint = {
          ...currentCheckpoint.checkpoint,
          channel_values: {
            ...(currentCheckpoint.checkpoint as any).channel_values,
            conversationHistory: result.conversationHistory,
            // NOTE: queryContext removed - entities and metricsIncluded now in conversationHistory
          },
        };
        await this.checkpointer.put(
          { configurable: { thread_id: sessionId, checkpoint_id: currentCheckpoint.checkpoint.id } },
          updatedCheckpoint,
          currentCheckpoint.metadata!
        );
        console.log(`💾 Persisted conversation history: ${result.conversationHistory.length} turns`);
      }
    }

    // Log final state for debugging
    logStateFinal(result);

    console.log('─'.repeat(80));
    console.log('✅ Workflow complete');
    console.log(`⏱️  Total time: ${result.metadata.endTime - result.metadata.startTime}ms`);
    console.log(`🤖 LLM calls: ${result.metadata.llmCalls}`);
    console.log(`🔧 Tool calls: ${result.metadata.toolCalls}`);

    // Log confidence metrics for observability
    if (result.result?.confidence !== undefined) {
      const confidenceEmoji = result.result.confidence >= 0.8 ? '🟢' : result.result.confidence >= 0.6 ? '🟡' : '🔴';
      console.log(`${confidenceEmoji} Confidence: ${(result.result.confidence * 100).toFixed(0)}%`);
      if (result.result.uncertaintyReasons?.length) {
        result.result.uncertaintyReasons.forEach((r: string) => console.log(`   ⚠️  ${r}`));
      }
    }

    // End debug execution logging with result summary
    endExecution(result);

    return result as CampaignAnalysisState;
  }

  /**
   * Stream the workflow execution (for real-time updates)
   * @param question - Natural language question
   * @param options - Optional execution options (sessionId, chatHistory, etc.)
   */
  async *stream(question: string, options?: WorkflowExecutionOptions) {
    const stateOptions: CreateInitialStateOptions = {
      sessionId: options?.sessionId,
    };
    const initialState = createInitialState(question, stateOptions);
    
    const invokeConfig = options?.sessionId
      ? { configurable: { thread_id: options.sessionId } }
      : undefined;

    for await (const chunk of await this.compiledGraph.stream(initialState, invokeConfig)) {
      yield chunk;
    }
  }

  /**
   * Get formatted conversation history for a session
   * Useful for passing to LLM context
   */
  async getFormattedHistory(sessionId: string): Promise<string> {
    const checkpoint = await this.checkpointer.getTuple({
      configurable: { thread_id: sessionId },
    });

    if (!checkpoint?.checkpoint) return '';

    const channelValues = (checkpoint.checkpoint as any).channel_values || {};
    return formatConversationHistory(channelValues.conversationHistory);
  }
}
