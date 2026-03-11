/**
 * Tests for PlannerAgent
 * Mock ONLY dependencies (LLM), NOT the agent itself
 */

jest.mock('@langchain/openai');
jest.mock('../../utils/debug-logger', () => ({
  logExecutionPlan: jest.fn(),
}));
jest.mock('../../utils/count-entity-rows', () => ({
  countEntityRows: jest.fn((data) => Array.isArray(data) ? data.length : 0),
}));

import { ChatOpenAI } from '@langchain/openai';
import { PlannerAgent } from '../planner-agent';
import { createInitialState } from '../../types/state';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

describe('PlannerAgent', () => {
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

  it('should create simple drilldown plan for top campaigns query', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [
        { type: 'drilldown', instruction: 'Get top 5 campaigns by ROI', reason: 'User asked for top campaigns' },
      ],
      reasoning: 'Simple single-dimension query',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Top 5 campaigns by ROI');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan).toHaveLength(1);
    expect(result.executionPlan?.plan?.[0]?.type).toBe('drilldown');
    expect(result.executionPlan?.reasoning).toBe('Simple single-dimension query');
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should create trend analysis plan', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [
        { type: 'trend', instruction: 'Get daily campaign trends for last 7 days', reason: 'Time-series analysis requested' },
      ],
      reasoning: 'Trend query for time-based analysis',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Show campaign trends for last 7 days');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan?.[0]?.type).toBe('trend');
  });

  it('should create entity lookup plan', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [
        { type: 'entity_lookup', instruction: 'List all active campaigns', reason: 'User wants campaign list without metrics' },
      ],
      reasoning: 'Metadata-only query',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('List all my campaigns');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan?.[0]?.type).toBe('entity_lookup');
  });

  it('should create multi-step plan for complex queries', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [
        { type: 'drilldown', instruction: 'Get top campaigns', reason: 'First get campaign performance' },
        { type: 'drilldown', instruction: 'Get traffic source breakdown', reason: 'Then break down by traffic source' },
      ],
      reasoning: 'Two-step plan for multi-dimension query',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Top campaigns and their traffic sources');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan).toHaveLength(2);
  });

  it('should include conversation history in planning', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [
        { type: 'drilldown', instruction: 'Get CPC for previous campaigns', reason: 'Follow-up on previous query' },
      ],
      reasoning: 'Follow-up query uses previous context',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('What about their CPC?');
    state.conversationHistory = [{
      question: 'Top campaigns by ROI',
      intent: 'analytics',
      summary: 'Top campaigns are A, B, C',
      timestamp: Date.now() - 60000,
      entities: [],
    }];

    await agent.createPlan(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Chat History');
  });

  it('should include metrics from previous turn', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Get more metrics', reason: 'Expand on previous' }],
      reasoning: 'Using previous context',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Show me more details');
    state.conversationHistory = [{
      question: 'Top campaigns',
      intent: 'analytics',
      summary: 'Top campaigns are A, B, C',
      timestamp: Date.now() - 60000,
      entities: [{ type: 'Campaign', id: '123', name: 'Campaign A' }],
      metricsIncluded: ['Revenue', 'ROI%'],
    }];

    await agent.createPlan(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Previous Turn Metrics');
  });

  it('should include accumulated data on replan cycle', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Get missing data', reason: 'Fill gap from cycle 1' }],
      reasoning: 'Cycle 2 - filling data gaps',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Complex query');
    state.planningCycleCount = 2;
    state.accumulatedData = [{
      type: 'drilldown',
      instruction: 'Get campaigns',
      reason: 'Initial query',
      data: [{ Name: 'A' }],
      entities: [],
      timestamp: Date.now(),
    }];

    await agent.createPlan(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Accumulated Data');
  });

  it('should include evaluator hint on replan', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Get traffic source data', reason: 'Per evaluator suggestion' }],
      reasoning: 'Following evaluator guidance',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Multi-part query');
    state.planningCycleCount = 2;
    state.evaluationResult = {
      decision: 'replan',
      confidence: 0.4,
      reasoning: 'Missing traffic source data',
      missingData: [{ type: 'drilldown', reason: 'Need traffic source breakdown' }],
    };

    await agent.createPlan(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Evaluator Suggestion');
  });

  it('should handle LLM errors gracefully', async () => {
    mockLLM.invoke.mockRejectedValue(new Error('API timeout'));

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Any query');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan).toEqual([]);
    expect(result.executionPlan?.reasoning).toContain('failed');
    expect(result.error).toContain('API timeout');
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should include entity sources in plan steps', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{
        type: 'drilldown',
        instruction: 'Get regional breakdown for top campaigns',
        reason: 'Break down by region',
        entitySources: [{ type: 'step', index: 0, entityTypes: ['Campaign'] }],
      }],
      reasoning: 'Filtered drilldown using previous entities',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Break down top campaigns by region');

    const result = await agent.createPlan(state);

    expect(result.executionPlan?.plan?.[0]?.entitySources).toBeDefined();
    expect(result.executionPlan?.plan?.[0]?.entitySources?.[0]?.type).toBe('step');
  });

  it('should increment LLM call counter', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Query', reason: 'Reason' }],
      reasoning: 'Plan',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Query');
    state.metadata.llmCalls = 3;

    const result = await agent.createPlan(state);

    expect(result.metadata?.llmCalls).toBe(4);
  });

  it('should add timing entry to metadata', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Query', reason: 'Reason' }],
      reasoning: 'Plan',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Query');
    state.metadata.timings = [];

    const result = await agent.createPlan(state);

    expect(result.metadata?.timings).toHaveLength(1);
    expect(result.metadata?.timings?.[0]?.step).toBe('planner');
    expect(result.metadata?.timings?.[0]?.type).toBe('llm');
  });

  it('should include current date time in prompt', async () => {
    mockLLM.invoke.mockResolvedValue({
      plan: [{ type: 'drilldown', instruction: 'Get data', reason: 'Query' }],
      reasoning: 'Plan',
    });

    const agent = new PlannerAgent('gpt-4o-mini');
    const state = createInitialState('Query');
    state.currentDateTime = '2025-01-07T10:00:00.000Z';

    await agent.createPlan(state);

    const invokeCall = mockLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('Current DateTime');
  });
});
