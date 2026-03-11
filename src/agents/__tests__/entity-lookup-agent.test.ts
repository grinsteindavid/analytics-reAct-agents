/**
 * Tests for EntityLookupAgent
 * Mock ONLY dependencies (LLM and lookup tools), NOT the agent itself
 */

jest.mock('@langchain/openai');
jest.mock('../../tools/campaign-lookup-tool');
jest.mock('../../tools/traffic-source-lookup-tool');
jest.mock('../../tools/generic-entity-lookup-tool');
jest.mock('../../utils/debug-logger', () => ({
  logEntityLookupResponse: jest.fn(),
}));

import { ChatOpenAI } from '@langchain/openai';
import { EntityLookupAgent } from '../entity-lookup-agent';
import { createCampaignLookupTool } from '../../tools/campaign-lookup-tool';
import { createTrafficSourceLookupTool } from '../../tools/traffic-source-lookup-tool';
import { createGenericEntityLookupTool } from '../../tools/generic-entity-lookup-tool';
import { createInitialState } from '../../types/state';
import { DatabaseContext } from '../../types/context';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;
const mockCreateCampaignLookupTool = createCampaignLookupTool as jest.MockedFunction<typeof createCampaignLookupTool>;
const mockCreateTrafficSourceLookupTool = createTrafficSourceLookupTool as jest.MockedFunction<typeof createTrafficSourceLookupTool>;
const mockCreateGenericEntityLookupTool = createGenericEntityLookupTool as jest.MockedFunction<typeof createGenericEntityLookupTool>;

describe('EntityLookupAgent', () => {
  let mockContext: DatabaseContext;
  let mockLLM: any;
  let mockCampaignTool: any;
  let mockTrafficSourceTool: any;
  let mockGenericTool: any;
  let mockBoundLLM: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {} as any,
    };

    mockCampaignTool = { invoke: jest.fn() };
    mockTrafficSourceTool = { invoke: jest.fn() };
    mockGenericTool = { invoke: jest.fn() };

    mockCreateCampaignLookupTool.mockReturnValue(mockCampaignTool);
    mockCreateTrafficSourceLookupTool.mockReturnValue(mockTrafficSourceTool);
    mockCreateGenericEntityLookupTool.mockReturnValue(mockGenericTool);

    mockBoundLLM = { invoke: jest.fn() };
    mockLLM = {
      bindTools: jest.fn().mockReturnValue(mockBoundLLM),
    };

    MockChatOpenAI.mockImplementation(() => mockLLM);
  });

  it('should lookup campaigns when LLM selects campaign tool', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { status: 'active' } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [
        { _id: '123', name: 'Campaign A', status: 'active' },
        { _id: '456', name: 'Campaign B', status: 'active' },
      ],
      count: 2,
      entityType: 'Campaign',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List all active campaigns');
    const result = await agent.lookup(state);

    expect(mockCampaignTool.invoke).toHaveBeenCalledWith({ status: 'active' });
    expect(result.entities).toHaveLength(2);
    expect(result.entities?.[0]?.type).toBe('Campaign');
    expect(result.metadata?.llmCalls).toBe(1);
    expect(result.metadata?.toolCalls).toBe(1);
  });

  it('should lookup traffic sources when LLM selects traffic source tool', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_traffic_sources', args: { apiName: 'GOOGLE' } }],
    });

    mockTrafficSourceTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [
        { _id: 'ts1', name: 'Google Ads', api: { name: 'GOOGLE' } },
      ],
      count: 1,
      entityType: 'TrafficSource',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Show Google traffic sources');
    const result = await agent.lookup(state);

    expect(mockTrafficSourceTool.invoke).toHaveBeenCalledWith({ apiName: 'GOOGLE' });
    expect(result.entities).toHaveLength(1);
    expect(result.entities?.[0]?.type).toBe('TrafficSource');
  });

  it('should lookup generic entities when LLM selects generic tool', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_generic_entity', args: { entityType: 'Offer' } }],
    });

    mockGenericTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ _id: 'offer1', name: 'Offer A' }],
      count: 1,
      entityType: 'Offer',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List all offers');
    const result = await agent.lookup(state);

    expect(mockGenericTool.invoke).toHaveBeenCalledWith({ entityType: 'Offer' });
    expect(result.entities).toHaveLength(1);
    expect(result.entities?.[0]?.type).toBe('Offer');
  });

  it('should return extracted entities only (no merge with state.entities)', async () => {
  // NOTE: Entity merging now happens in execute-plan.ts via entitySources, not in agents
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { status: 'active' } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ _id: '789', name: 'Campaign C', status: 'active' }],
      count: 1,
      entityType: 'Campaign',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List campaigns');
    state.entities = [{ type: 'Campaign', id: '123', name: 'Existing Campaign' }];
    const result = await agent.lookup(state);

    // Only returns extracted entities, does NOT merge with state.entities
    expect(result.entities).toHaveLength(1);
    expect(result.entities?.map(e => e.id)).toContain('789');
    expect(result.entities?.map(e => e.id)).not.toContain('123');
  });

  it('should deduplicate entities by type+id', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { status: 'active' } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ _id: '123', name: 'Campaign A Updated', status: 'active' }],
      count: 1,
      entityType: 'Campaign',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List campaigns');
    state.entities = [{ type: 'Campaign', id: '123', name: 'Campaign A' }];
    const result = await agent.lookup(state);

    expect(result.entities).toHaveLength(1);
  });

  it('should handle no tool selected by LLM', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      content: 'I cannot determine which tool to use',
      tool_calls: undefined,
    });

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Do something');
    const result = await agent.lookup(state);

    expect(result.error).toContain('No tool selected');
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should handle unknown tool selection', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'unknown_tool', args: {} }],
    });

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List something');
    const result = await agent.lookup(state);

    expect(result.error).toContain('Unknown tool');
  });

  it('should handle tool returning failure', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { status: 'active' } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'Database connection failed',
      data: [],
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List campaigns');
    const result = await agent.lookup(state);

    expect(result.error).toBe('Database connection failed');
    expect(result.metadata?.llmCalls).toBe(1);
    expect(result.metadata?.toolCalls).toBe(1);
  });

  it('should handle LLM errors gracefully', async () => {
    mockBoundLLM.invoke.mockRejectedValue(new Error('API rate limit exceeded'));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List campaigns');
    const result = await agent.lookup(state);

    expect(result.error).toContain('API rate limit exceeded');
    expect(result.metadata?.llmCalls).toBe(1);
  });

  it('should increment metadata counters', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { status: 'active' } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [],
      count: 0,
      entityType: 'Campaign',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('List campaigns');
    state.metadata.llmCalls = 3;
    state.metadata.toolCalls = 5;
    const result = await agent.lookup(state);

    expect(result.metadata?.llmCalls).toBe(4);
    expect(result.metadata?.toolCalls).toBe(6);
  });

  it('should pass entity filters to LLM input', async () => {
    mockBoundLLM.invoke.mockResolvedValue({
      tool_calls: [{ name: 'lookup_campaigns', args: { ids: ['123', '456'] } }],
    });

    mockCampaignTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ _id: '123', name: 'Campaign A' }],
      count: 1,
      entityType: 'Campaign',
    }));

    const agent = new EntityLookupAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Get campaign details');
    state.entities = [
      { type: 'Campaign', id: '123', name: 'Campaign A' },
      { type: 'Campaign', id: '456', name: 'Campaign B' },
    ];
    await agent.lookup(state);

    const invokeCall = mockBoundLLM.invoke.mock.calls[0]?.[0];
    const userMessage = invokeCall?.[1]?.content;
    expect(userMessage).toContain('entityFilters');
    expect(userMessage).toContain('Campaign');
  });
});
