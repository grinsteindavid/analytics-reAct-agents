/**
 * Debug Logger Utility - Session-Based with State Tracking
 * 
 * FULL DEBUG DATA with state snapshots for tracing multi-turn conversations
 * 
 * Structure:
 * .debug-logs/
 *   sessions/
 *     {sessionId}/
 *       session.json           - Session overview with all turns
 *       turn_001/              - First question
 *         00_state_initial.json   - State loaded from checkpointer
 *         01_intent.json          - Intent classification
 *         02_traffic-source.json  - Tool execution
 *         03_drilldown.json       - Tool execution
 *         04_state_after_tools.json - State after tools
 *         05_summary.json         - Summary generation
 *         06_state_final.json     - Final state saved to checkpointer
 *         turn.json               - Turn summary
 *       turn_002/              - Second question (follow-up)
 *         ...
 */
import * as fs from 'fs';
import * as path from 'path';
import { countEntityRows } from './count-entity-rows';

const DEBUG_DIR = path.join(__dirname, '../../.debug-logs');

type StepType = 'state-initial' | 'intent' | 'planner' | 'drilldown' | 'trend-analysis' |
  'traffic-source' | 'campaign' | 'entity-lookup' | 'evaluate' | 'data-collection' | 'summary-input' | 'summary' | 'state-after-tools' | 'state-final';

/**
 * Session info stored in session.json
 */
interface SessionInfo {
  sessionId: string;
  createdAt: string;
  turns: TurnSummary[];
}

/**
 * Turn summary for session.json
 */
interface TurnSummary {
  turn: number;
  question: string;
  intent: string;
  timestamp: string;
  duration: number;
  folder: string;
  previousContext?: {
    hasConversationHistory: boolean;
    historyLength: number;
    entityCount?: number;
    metricsIncluded?: string[];
  };
}

/**
 * Current turn context
 */
interface TurnContext {
  sessionId: string;
  turnNumber: number;
  turnDir: string;
  sessionDir: string;
  stepCounter: number;
  question: string;
  startTime: number;
  steps: Array<{ step: number; type: StepType; file: string; timestamp: string }>;
  initialState?: any;
}

let currentTurn: TurnContext | null = null;

/**
 * Ensure directory exists
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if debug mode is enabled
 */
function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true';
}

/**
 * Get or create session info
 */
function getSessionInfo(sessionDir: string, sessionId: string): SessionInfo {
  const sessionFile = path.join(sessionDir, 'session.json');
  if (fs.existsSync(sessionFile)) {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
  }
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    turns: [],
  };
}

/**
 * Save session info
 */
function saveSessionInfo(sessionDir: string, info: SessionInfo): void {
  const sessionFile = path.join(sessionDir, 'session.json');
  fs.writeFileSync(sessionFile, JSON.stringify(info, null, 2), 'utf-8');
}

/**
 * Start a new turn within a session
 */
export function startExecution(question: string, sessionId?: string): string | null {
  if (!isDebugEnabled()) return null;

  const effectiveSessionId = sessionId || `anonymous_${Date.now()}`;
  const sessionDir = path.join(DEBUG_DIR, 'sessions', effectiveSessionId);
  ensureDir(sessionDir);

  // Get session info to determine turn number
  const sessionInfo = getSessionInfo(sessionDir, effectiveSessionId);
  const turnNumber = sessionInfo.turns.length + 1;
  const turnFolder = `turn_${String(turnNumber).padStart(3, '0')}`;
  const turnDir = path.join(sessionDir, turnFolder);
  ensureDir(turnDir);

  currentTurn = {
    sessionId: effectiveSessionId,
    turnNumber,
    turnDir,
    sessionDir,
    stepCounter: 0,
    question,
    startTime: Date.now(),
    steps: [],
  };

  console.log(`📂 Debug: session/${effectiveSessionId}/${turnFolder}/`);
  return effectiveSessionId;
}

/**
 * Log initial state (loaded from checkpointer)
 */
export function logStateInitial(state: any): string | null {
  if (!isDebugEnabled() || !currentTurn) return null;

  currentTurn.initialState = state;

  const stateSnapshot = {
    turn: currentTurn.turnNumber,
    type: 'state-initial',
    timestamp: new Date().toISOString(),
    description: 'State loaded from checkpointer at turn start',
    state: {
      question: state?.question,
      intent: state?.intent,
      conversationHistory: state?.conversationHistory?.map((turn: any) => ({
        question: turn.question,
        intent: turn.intent,
        timestamp: turn.timestamp,
        entities: turn.entities?.slice(0, 10), // Include entities (capped at 10 for log readability)
        entityCount: turn.entities?.length || 0,
        metricsIncluded: turn.metricsIncluded,
      })),
      // Don't log transient data (drilldownData, entityLookupData, entities, etc.)
    },
    metadata: {
      hasConversationHistory: (state?.conversationHistory?.length || 0) > 0,
      historyLength: state?.conversationHistory?.length || 0,
    },
  };

  const filepath = path.join(currentTurn.turnDir, '00_state_initial.json');
  fs.writeFileSync(filepath, JSON.stringify(stateSnapshot, null, 2), 'utf-8');

  currentTurn.steps.push({
    step: 0,
    type: 'state-initial',
    file: '00_state_initial.json',
    timestamp: stateSnapshot.timestamp,
  });

  console.log(`📝 State: initial (history: ${stateSnapshot.metadata.historyLength} turns)`);
  return filepath;
}

/**
 * Log a step within the current turn
 */
export function logStep(type: StepType, data: any): string | null {
  if (!isDebugEnabled() || !currentTurn) return null;

  currentTurn.stepCounter++;
  const stepNum = String(currentTurn.stepCounter).padStart(2, '0');
  const filename = `${stepNum}_${type}.json`;
  const filepath = path.join(currentTurn.turnDir, filename);

  const stepData = {
    sessionId: currentTurn.sessionId,
    turn: currentTurn.turnNumber,
    step: currentTurn.stepCounter,
    type,
    timestamp: new Date().toISOString(),
    ...data,
  };

  fs.writeFileSync(filepath, JSON.stringify(stepData, null, 2), 'utf-8');

  currentTurn.steps.push({
    step: currentTurn.stepCounter,
    type,
    file: filename,
    timestamp: stepData.timestamp,
  });

  console.log(`📝 Step ${stepNum}: ${type}`);
  return filepath;
}

/**
 * Log state after tools executed (before summary)
 */
export function logStateAfterTools(state: any): string | null {
  if (!isDebugEnabled() || !currentTurn) return null;

  currentTurn.stepCounter++;
  const stepNum = String(currentTurn.stepCounter).padStart(2, '0');
  const filename = `${stepNum}_state_after_tools.json`;
  const filepath = path.join(currentTurn.turnDir, filename);

  const stateSnapshot = {
    sessionId: currentTurn.sessionId,
    turn: currentTurn.turnNumber,
    step: currentTurn.stepCounter,
    type: 'state-after-tools',
    timestamp: new Date().toISOString(),
    description: 'State after tool execution, before summary generation',
    state: {
      intent: state?.intent,
      // Include data summaries (not full data)
      drilldownData: state?.drilldownData ? {
        rowCount: state.drilldownData.length,
        columns: Object.keys(state.drilldownData[0] || {}),
        sample: state.drilldownData.slice(0, 2),
      } : undefined,
      accumulatedData: state?.accumulatedData?.map((d: any) => ({
        type: d.type,
        entityCount: d.entities?.length || 0,
        dataSize: d.data?.length || 0,
      })),
    },
    changes: {
      fromInitial: {
        intentChanged: state?.intent !== currentTurn.initialState?.intent,
        hasNewDrilldownData: !!state?.drilldownData && !currentTurn.initialState?.drilldownData,
      },
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(stateSnapshot, null, 2), 'utf-8');

  currentTurn.steps.push({
    step: currentTurn.stepCounter,
    type: 'state-after-tools',
    file: filename,
    timestamp: stateSnapshot.timestamp,
  });

  console.log(`📝 State: after-tools`);
  return filepath;
}

/**
 * Log final state (saved to checkpointer)
 */
export function logStateFinal(state: any): string | null {
  if (!isDebugEnabled() || !currentTurn) return null;

  currentTurn.stepCounter++;
  const stepNum = String(currentTurn.stepCounter).padStart(2, '0');
  const filename = `${stepNum}_state_final.json`;
  const filepath = path.join(currentTurn.turnDir, filename);

  const stateSnapshot = {
    sessionId: currentTurn.sessionId,
    turn: currentTurn.turnNumber,
    step: currentTurn.stepCounter,
    type: 'state-final',
    timestamp: new Date().toISOString(),
    description: 'Final state saved to checkpointer',
    state: {
      intent: state?.intent,
      conversationHistory: state?.conversationHistory?.map((turn: any) => ({
        question: turn.question,
        intent: turn.intent,
        timestamp: turn.timestamp,
        summary: turn.summary,
        confidence: turn.confidence,
        uncertaintyReasons: turn.uncertaintyReasons,
        entities: turn.entities?.slice(0, 10), // Include entities (capped at 10 for log readability)
        entityCount: turn.entities?.length || 0,
        metricsIncluded: turn.metricsIncluded,
      })),
      result: state?.result ? {
        summary: state.result.summary,
        keyInsights: state.result.keyInsights,
        confidence: state.result.confidence,
        uncertaintyReasons: state.result.uncertaintyReasons,
        dataIncomplete: state.result.dataIncomplete,
        totalRows: state.result.totalRows,
      } : undefined,
    },
    metadata: {
      conversationHistoryLength: state?.conversationHistory?.length || 0,
    },
  };

  fs.writeFileSync(filepath, JSON.stringify(stateSnapshot, null, 2), 'utf-8');

  currentTurn.steps.push({
    step: currentTurn.stepCounter,
    type: 'state-final',
    file: filename,
    timestamp: stateSnapshot.timestamp,
  });

  console.log(`📝 State: final (history: ${stateSnapshot.metadata.conversationHistoryLength} turns)`);
  return filepath;
}

/**
 * End the current turn and update session
 */
export function endExecution(result: any): string | null {
  if (!isDebugEnabled() || !currentTurn) return null;

  const duration = Date.now() - currentTurn.startTime;

  // Save turn summary
  const turnSummary = {
    sessionId: currentTurn.sessionId,
    turn: currentTurn.turnNumber,
    question: currentTurn.question,
    intent: result?.intent,
    startTime: new Date(currentTurn.startTime).toISOString(),
    endTime: new Date().toISOString(),
    duration,
    totalSteps: currentTurn.stepCounter,
    steps: currentTurn.steps,
    result: {
      summary: result?.result?.summary,
      keyInsights: result?.result?.keyInsights,
      error: result?.error,
    },
    metadata: {
      llmCalls: result?.metadata?.llmCalls,
      toolCalls: result?.metadata?.toolCalls,
    },
  };

  const turnFile = path.join(currentTurn.turnDir, 'turn.json');
  fs.writeFileSync(turnFile, JSON.stringify(turnSummary, null, 2), 'utf-8');

  // Update session.json
  const sessionInfo = getSessionInfo(currentTurn.sessionDir, currentTurn.sessionId);
  const turnEntry: TurnSummary = {
    turn: currentTurn.turnNumber,
    question: currentTurn.question,
    intent: result?.intent || 'unknown',
    timestamp: new Date(currentTurn.startTime).toISOString(),
    duration,
    folder: `turn_${String(currentTurn.turnNumber).padStart(3, '0')}`,
  };

  // Add previous context info if this is a follow-up
  if (currentTurn.initialState?.conversationHistory?.length > 0) {
    const lastTurn = currentTurn.initialState.conversationHistory[
      currentTurn.initialState.conversationHistory.length - 1
    ];
    turnEntry.previousContext = {
      hasConversationHistory: true,
      historyLength: currentTurn.initialState.conversationHistory.length,
      entityCount: lastTurn?.entities?.length || 0,
      metricsIncluded: lastTurn?.metricsIncluded,
    };
  }

  sessionInfo.turns.push(turnEntry);
  saveSessionInfo(currentTurn.sessionDir, sessionInfo);

  console.log(`✅ Turn ${currentTurn.turnNumber} complete: ${duration}ms`);
  console.log(`📁 Debug: .debug-logs/sessions/${currentTurn.sessionId}/`);

  currentTurn = null;
  return turnFile;
}

/**
 * Get current session ID
 */
export function getCurrentExecutionId(): string | null {
  return currentTurn?.sessionId || null;
}

/**
 * Log intent classification step
 */
export function logIntentClassification(input: any, output: any): string | null {
  return logStep('intent', { input, output });
}

/**
 * Log execution plan from Planner agent
 */
export function logExecutionPlan(
  cycleCount: number,
  plan: any[],
  reasoning: string,
  accumulatedDataSummary?: any[],
  llmInput?: {  // Structured input for readability
    question: string;
    chatHistory: string | null;
    previousMetrics: string[] | null;
    accumulatedData: any[];
    evaluatorHint?: any | null;
    cycleCount: number;
    currentDateTime: string;
  }
): string | null {
  return logStep('planner', {
    cycleCount,
    planStepCount: plan.length,
    plan: plan.map(step => ({
      type: step.type,
      instruction: step.instruction,
      reason: step.reason,
      entitySources: step.entitySources || [],
    })),
    reasoning,
    accumulatedDataSummary: accumulatedDataSummary || [],
    llmInput: llmInput || null,
  });
}

/**
 * Log drilldown query and response
 */
export function logDrilldownResponse(
  groupBy: string,
  query: any,
  response: any,
  metricsRequested?: string[] | null,
  llmInput?: any
): string | null {
  const entityRowCount = countEntityRows(response);
  const rowCount = typeof entityRowCount === 'number' ? entityRowCount : 0;  // Excludes Total row

  // Handle both nested (tool schema) and flat (LLM output) query structures
  const queryLog = query ? {
    filters: query.filters?.filter((f: any) => f.ids?.length > 0),
    // Nested structure (drilldown tool)
    options: query.options,
    // Flat structure (LLM output for trend)
    dimension: query.dimension,
    time_dimension: query.time_dimension,
    sort: query.sort,
    direction: query.direction,
    conditions: query.conditions,
    limit: query.limit,
    dates: query.dates,
  } : null;

  return logStep('drilldown', {
    groupBy,
    llmInput: llmInput || null,
    query: queryLog,
    responseMetadata: {
      rowCount,
      firstRow: response?.[0]?.Name || 'N/A',
      columns: Object.keys(response?.[0] || {}),
      metricsRequested: metricsRequested || null,
    },
    response,
  });
}

/**
 * Log traffic source query and response
 */
export function logTrafficSourceResponse(filter: string, query: any, response: any): string | null {
  const count = Array.isArray(response) ? response.length : 0;
  return logStep('traffic-source', {
    filter,
    query,
    responseMetadata: {
      count,
      ids: response?.map((r: any) => r._id),
      names: response?.map((r: any) => r.name),
    },
    response,
  });
}

/**
 * Log campaign query and response
 */
export function logCampaignResponse(filter: string, query: any, response: any): string | null {
  const count = Array.isArray(response) ? response.length : 0;
  return logStep('campaign', {
    filter,
    query,
    responseMetadata: {
      count,
      ids: response?.map((r: any) => r._id),
      names: response?.map((r: any) => r.name),
    },
    response,
  });
}

/**
 * Log entity lookup query and response
 */
export function logEntityLookupResponse(
  toolName: string,
  entityType: string,
  params: any,
  response: any,
  entities: any[],
  llmInput?: any
): string | null {
  const count = Array.isArray(response) ? response.length : 0;
  return logStep('entity-lookup', {
    tool: toolName,
    entityType,
    llmInput: llmInput || null,
    params,
    responseMetadata: {
      count,
      entityIds: entities?.map((e: any) => e.id),
      entityNames: entities?.map((e: any) => e.name),
    },
    response,
    entities,
  });
}

/**
 * Log evaluation result from Evaluator agent
 */
export function logEvaluation(
  cycleCount: number,
  evaluation: {
    decision: 'summarize' | 'replan';
    confidence: number;
    reasoning: string;
    missingData?: any[] | null;
  },
  maxCyclesReached: boolean = false,
  llmInput?: {  // Structured input for readability
    question: string;
    planExecuted: any[];
    accumulatedData: any[];
    chatHistory: string | null;
    cycleCount: number;
    maxCycles: number;
  }
): string | null {
  return logStep('evaluate', {
    cycleCount,
    decision: maxCyclesReached ? 'summarize' : evaluation.decision,
    confidence: evaluation.confidence,
    reasoning: evaluation.reasoning,
    missingData: evaluation.missingData || null,
    maxCyclesReached,
    llmInput: llmInput || null,
  });
}

/**
 * Log summary agent input for debugging (full LLM input)
 */
export function logSummaryInput(input: any): string | null {
  return logStep('summary-input', input);
}

/**
 * Log summary generation result
 */
export function logSummaryGeneration(
  summary: string,
  keyInsights: string[] | null,
  confidence: number | undefined,
  uncertaintyReasons: string[] | undefined,
  dataIncomplete: boolean | undefined
): string | null {
  return logStep('summary', {
    summary,
    keyInsights,
    confidence,
    uncertaintyReasons: uncertaintyReasons || [],
    dataIncomplete: dataIncomplete || false,
  });
}
