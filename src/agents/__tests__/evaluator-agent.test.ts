/**
 * Tests for EvaluatorAgent
 * Mock ONLY dependencies (LLM), NOT the agent itself
 */

jest.mock('@langchain/openai');
jest.mock('../../utils/debug-logger', () => ({
  logEvaluation: jest.fn(),
}));
jest.mock('../../utils/count-entity-rows', () => ({
  countEntityRows: jest.fn((data) => Array.isArray(data) ? data.length : 0),
}));

import { ChatOpenAI } from '@langchain/openai';
import { EvaluatorAgent } from '../evaluator-agent';
import { createInitialState } from '../../types/state';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

describe('EvaluatorAgent', () => {
  let mockLLM: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLM = {
      invoke: jest.fn(),
      withStructuredOutput: jest.fn().mockReturnThis(),
    };

    (mockLLM.withStructuredOutput as jest.Mock).mockReturnValue(mockLLM);
    MockChatOpenAI.mockImplementation(() => mockLLM);
  });

  it('should return summarize decision when data is sufficient', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.95,
      reasoning: 'Have all required data for the question',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Top 5 campaigns by ROI');
    state.accumulatedData = [{
      type: 'drilldown',
      instruction: 'Get top campaigns',
      reason: 'Need campaign performance',
      data: [{ Name: 'Campaign A', ROI: 3.0 }],
      entities: [],
      timestamp: Date.now(),
    }];
    state.executionPlan = {
      plan: [{ type: 'drilldown', instruction: 'Get top campaigns', reason: 'Need data' }],
      reasoning: 'Simple query',
    };

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.decision).toBe('summarize');
    expect(result.evaluationResult?.confidence).toBe(0.95);
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should return replan decision with missing data', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'replan',
      confidence: 0.4,
      reasoning: 'Missing traffic source breakdown',
      missingData: [
        { type: 'drilldown', reason: 'Need traffic source performance data' },
      ],
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Compare campaigns and traffic sources');
    state.accumulatedData = [{
      type: 'drilldown',
      instruction: 'Get campaigns',
      reason: 'Campaign data',
      data: [{ Name: 'Campaign A' }],
      entities: [],
      timestamp: Date.now(),
    }];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.decision).toBe('replan');
    expect(result.evaluationResult?.missingData).toHaveLength(1);
    expect(result.evaluationResult?.missingData?.[0]?.type).toBe('drilldown');
  });

  it('should force summarize when cycle limit reached', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.6,
      reasoning: 'Final cycle - summarizing with available data',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Complex multi-part query');
    state.planningCycleCount = 3;
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.decision).toBe('summarize');
  });

  it('should handle high confidence evaluation', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.98,
      reasoning: 'Perfect data match',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Simple query');
    state.accumulatedData = [{
      type: 'drilldown',
      instruction: 'Get data',
      reason: 'Query',
      data: [{ Name: 'A' }, { Name: 'B' }],
      entities: [],
      timestamp: Date.now(),
    }];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('should handle low confidence evaluation', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.45,
      reasoning: 'Data may be incomplete',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Ambiguous query');
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.confidence).toBeLessThan(0.5);
  });

  it('should handle empty accumulated data', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.5,
      reasoning: 'No data fetched',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Query with no results');
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.decision).toBe('summarize');
  });

  it('should handle LLM errors gracefully', async () => {
    mockLLM.invoke.mockRejectedValue(new Error('API error'));

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Any query');
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.evaluationResult?.decision).toBe('summarize');
    expect(result.evaluationResult?.confidence).toBe(0.5);
    expect(result.evaluationResult?.reasoning).toContain('failed');
  });

  it('should include conversation history in evaluation', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.9,
      reasoning: 'Follow-up answered',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('What about their CPC?');
    state.conversationHistory = [{
      question: 'Top campaigns by ROI',
      intent: 'analytics',
      summary: 'Campaign A had best ROI',
      timestamp: Date.now() - 60000,
      entities: [],
    }];
    state.accumulatedData = [{
      type: 'drilldown',
      instruction: 'Get CPC',
      reason: 'Follow-up',
      data: [{ Name: 'Campaign A', CPC: 0.5 }],
      entities: [],
      timestamp: Date.now(),
    }];

    await agent.evaluate(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Chat History');
  });

  it('should increment LLM call counter', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.9,
      reasoning: 'OK',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Query');
    state.metadata.llmCalls = 5;
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.metadata?.llmCalls).toBe(6);
  });

  it('should add timing entry to metadata', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.9,
      reasoning: 'OK',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Query');
    state.metadata.timings = [];
    state.accumulatedData = [];

    const result = await agent.evaluate(state);

    expect(result.metadata?.timings).toHaveLength(1);
    expect(result.metadata?.timings?.[0]?.step).toBe('evaluator');
    expect(result.metadata?.timings?.[0]?.type).toBe('llm');
  });

  it('should include execution plan info in prompt', async () => {
    mockLLM.invoke.mockResolvedValue({
      decision: 'summarize',
      confidence: 0.9,
      reasoning: 'Plan executed successfully',
      missingData: null,
    });

    const agent = new EvaluatorAgent('gpt-4o-mini');
    const state = createInitialState('Multi-step query');
    state.executionPlan = {
      plan: [
        { type: 'drilldown', instruction: 'Step 1', reason: 'Get campaigns' },
        { type: 'entity_lookup', instruction: 'Step 2', reason: 'Get details' },
      ],
      reasoning: 'Two-step plan',
    };
    state.accumulatedData = [
      { type: 'drilldown', instruction: 'Step 1', reason: 'Get campaigns', data: [{}], entities: [], timestamp: Date.now() },
      { type: 'entity_lookup', instruction: 'Step 2', reason: 'Get details', data: [{}], entities: [], timestamp: Date.now() },
    ];

    await agent.evaluate(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Plan that was executed');
    expect(userMessage).toContain('2 steps');
  });
});
