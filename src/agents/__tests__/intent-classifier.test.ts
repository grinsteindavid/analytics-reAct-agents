/**
 * Tests for IntentClassifierAgent
 * Simplified: Only classifies intent, no entity extraction
 */

jest.mock('@langchain/openai');

import { ChatOpenAI } from '@langchain/openai';
import { IntentClassifierAgent } from '../intent-classifier';
import { createInitialState } from '../../types/state';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

describe('IntentClassifierAgent', () => {
  let mockLLM: jest.Mocked<ChatOpenAI>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLM = {
      invoke: jest.fn(),
      withStructuredOutput: jest.fn().mockReturnThis(),
    } as any;

    (mockLLM.withStructuredOutput as jest.Mock).mockReturnValue(mockLLM);
    MockChatOpenAI.mockImplementation(() => mockLLM);
  });

  it('should classify analytics intent for drilldown queries', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'analytics', isFollowUp: false } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('Best campaigns by ROI');
    const result = await agent.classify(state);

    expect(result.intent).toBe('analytics');
    expect(result.entities).toEqual([]); // No entity extraction
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should classify analytics intent for trend queries', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'analytics', isFollowUp: false } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('Show campaign trends last 7 days');
    const result = await agent.classify(state);

    expect(result.intent).toBe('analytics');
  });

  it('should classify analytics intent for filtered queries', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'analytics', isFollowUp: false } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('Best campaigns from Google');
    const result = await agent.classify(state);

    expect(result.intent).toBe('analytics');
  });

  it('should classify metadata_only intent for pure listing', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'metadata_only', isFollowUp: false } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('List all campaigns');
    const result = await agent.classify(state);

    expect(result.intent).toBe('metadata_only');
  });

  it('should classify analytics intent with isFollowUp for follow-up queries', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'analytics', isFollowUp: true } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('What about their CPC?');
    state.conversationHistory = [{ question: 'Top campaigns', intent: 'analytics', timestamp: Date.now(), summary: 'Top campaigns summary', entities: [] }];
    const result = await agent.classify(state);

    expect(result.intent).toBe('analytics');
    expect(result.isFollowUp).toBe(true);
  });

  it('should classify non_analytics intent', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'non_analytics' } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('What is the weather today?');
    const result = await agent.classify(state);

    expect(result.intent).toBe('non_analytics');
  });

  it('should handle LLM errors gracefully', async () => {
    mockLLM.invoke.mockRejectedValue(new Error('API rate limit exceeded'));

    const agent = new IntentClassifierAgent();
    const state = createInitialState('Best campaigns by ROI');
    const result = await agent.classify(state);

    expect(result.intent).toBe('non_analytics');
    expect(result.error).toContain('API rate limit exceeded');
  });

  it('should increment LLM call counter', async () => {
    mockLLM.invoke.mockResolvedValue({ intent: 'analytics', isFollowUp: false } as any);

    const agent = new IntentClassifierAgent();
    const state = createInitialState('Best campaigns by ROI');
    state.metadata.llmCalls = 5;
    const result = await agent.classify(state);

    expect(result.metadata?.llmCalls).toBe(6);
  });
});
