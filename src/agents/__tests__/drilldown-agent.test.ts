/**
 * Tests for DrilldownAgent
 * Mock ONLY dependencies (LLM and drilldown tool), NOT the agent itself
 */

jest.mock('@langchain/openai');
jest.mock('../../tools/drilldown-tool');

import { ChatOpenAI } from '@langchain/openai';
import { DrilldownAgent } from '../drilldown-agent';
import { createDrilldownTool } from '../../tools/drilldown-tool';
import { createInitialState } from '../../types/state';
import { DatabaseContext } from '../../types/context';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;
const mockCreateDrilldownTool = createDrilldownTool as jest.MockedFunction<typeof createDrilldownTool>;

describe('DrilldownAgent', () => {
  let mockContext: DatabaseContext;
  let mockLLM: jest.Mocked<ChatOpenAI>;
  let mockDrilldownTool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Redshift via processReport - only needs mongoose for entity lookups
    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {} as any,
    };

    mockLLM = {
      invoke: jest.fn(),
    } as any;

    mockDrilldownTool = {
      invoke: jest.fn(),
    };

    MockChatOpenAI.mockImplementation(() => mockLLM);
    mockCreateDrilldownTool.mockReturnValue(mockDrilldownTool);
  });

  it('should execute drilldown and extract campaign IDs', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');
    state.entities = [];
    state.extractedParams = {
      sortMetric: 'ROI%',
      limit: 10,
    };

    // Mock LLM response for query building
    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: {
          group_by: ['campaign_name'],
          conditions: [{
            metric: 'roi',
            type: 'Greater Than',
            value: 0,
          }],
        },
        dates: {
          based_on: 'conversion_date',
          from: 'last_7_days',
          to: 'now',
        },
      }),
    } as any);

    // Mock drilldown tool response with Total row
    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [
        { Name: 'Total', ID: 'Total', Clicks: 1000, ROI: 2.5 },
        { Name: 'Campaign 1', ID: '123', Clicks: 500, ROI: 3.0 },
        { Name: 'Campaign 2', ID: '456', Clicks: 500, ROI: 2.0 },
      ],
      rowCount: 3,
      campaignIds: ['123', '456'],
    }));

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.drilldownData).toHaveLength(3);
    expect(result.entities).toBeDefined();
    expect(result.metadata?.llmCalls).toBe(1);
    expect(result.metadata?.toolCalls).toBe(1);
  });

  it('should handle LLM errors in query building', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');

    mockLLM.invoke.mockRejectedValue(new Error('LLM API error'));

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.error).toContain('LLM API error');
    expect(result.drilldownData).toBeUndefined();
  });

  it('should handle drilldown tool errors', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: { group_by: ['campaign_name'] },
        dates: { based_on: 'conversion_date', from: 'last_7_days', to: 'now' },
      }),
    } as any);

    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'Database query failed',
    }));

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.error).toBe('Database query failed');
  });

  it('should handle invalid JSON from LLM', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');

    mockLLM.invoke.mockResolvedValue({
      content: 'This is not valid JSON',
    } as any);

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.error).toBeDefined();
    expect(result.error).toContain('JSON');
  });

  it('should build query with traffic source filter', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best Google campaigns by revenue');
    state.entities = [];
    state.extractedParams = {
      sortMetric: 'Revenue',
      trafficSource: 'GOOGLE',
      limit: 5,
    };

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [{
          type: 'traffic_source',
          conditions: [{
            metric: 'traffic_source_name',
            type: 'Equal To',
            value: 'GOOGLE',
          }],
        }],
        options: {
          group_by: ['campaign_name'],
        },
        dates: {
          based_on: 'conversion_date',
          from: 'last_7_days',
          to: 'now',
        },
      }),
    } as any);

    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ Name: 'Total', ID: 'Total' }],
      rowCount: 1,
    }));

    // Act
    await agent.execute(state);

    // Assert
    expect(mockDrilldownTool.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({
            type: 'traffic_source',
          }),
        ]),
      })
    );
  });

  it('should handle empty drilldown results', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: { group_by: ['campaign_name'] },
        dates: { based_on: 'conversion_date', from: 'last_7_days', to: 'now' },
      }),
    } as any);

    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [],
      rowCount: 0,
    }));

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.drilldownData).toEqual([]);
    expect(result.entities).toEqual([]);
  });

  it('should increment metadata counters', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');
    state.metadata.llmCalls = 3;
    state.metadata.toolCalls = 5;

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: { group_by: ['campaign_name'] },
        dates: { based_on: 'conversion_date', from: 'last_7_days', to: 'now' },
      }),
    } as any);

    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [],
      rowCount: 0,
    }));

    // Act
    const result = await agent.execute(state);

    // Assert
    expect(result.metadata?.llmCalls).toBe(4); // 3 + 1
    expect(result.metadata?.toolCalls).toBe(6); // 5 + 1
  });

  it('should retry once on schema validation error', async () => {
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');
    state.entities = [];

    const badQuery = {
      filters: [],
      options: { group_by: ['campaign_name'] },
      dates: { based_on: 'conversion_date', from: 'bad', to: 'bad' },
    };
    const fixedQuery = {
      filters: [],
      options: { group_by: ['campaign_name'] },
      dates: { based_on: 'conversion_date', from: 'last_7_days', to: 'now' },
    };

    // First LLM call returns bad query, second returns fixed query
    mockLLM.invoke
      .mockResolvedValueOnce({ content: JSON.stringify(badQuery) } as any)
      .mockResolvedValueOnce({ content: JSON.stringify(fixedQuery) } as any);

    // First tool invoke throws schema error, second succeeds
    mockDrilldownTool.invoke
      .mockRejectedValueOnce(new Error('Received tool input did not match expected schema'))
      .mockResolvedValueOnce(JSON.stringify({
        success: true,
        data: [{ Name: 'Campaign 1', ID: '123', ROI: 3.0 }],
        rowCount: 1,
        groupBy: 'Campaign',
      }));

    const result = await agent.execute(state);

    expect(mockLLM.invoke).toHaveBeenCalledTimes(2);
    expect(mockDrilldownTool.invoke).toHaveBeenCalledTimes(2);
    expect(result.drilldownData).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it('should propagate non-schema errors without retry', async () => {
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Best campaigns by ROI');

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: { group_by: ['campaign_name'] },
        dates: { based_on: 'conversion_date', from: 'last_7_days', to: 'now' },
      }),
    } as any);

    mockDrilldownTool.invoke.mockRejectedValue(new Error('Database connection failed'));

    const result = await agent.execute(state);

    expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
    expect(mockDrilldownTool.invoke).toHaveBeenCalledTimes(1);
    expect(result.error).toContain('Database connection failed');
  });

  it('should handle date range in query', async () => {
    // Arrange
    const agent = new DrilldownAgent(mockContext, 'gpt-4o-mini');
    const state = createInitialState('Campaigns from Oct 2024');
    state.entities = [];
    state.extractedParams = {
      dateRange: 'oct_2024',
    };

    mockLLM.invoke.mockResolvedValue({
      content: JSON.stringify({
        filters: [],
        options: { group_by: ['campaign_name'] },
        dates: {
          based_on: 'conversion_date',
          from: '2024-10-01',
          to: '2024-10-31',
        },
      }),
    } as any);

    mockDrilldownTool.invoke.mockResolvedValue(JSON.stringify({
      success: true,
      data: [{ Name: 'Total', ID: 'Total' }],
      rowCount: 1,
    }));

    // Act
    await agent.execute(state);

    // Assert
    expect(mockDrilldownTool.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        dates: expect.objectContaining({
          from: '2024-10-01',
          to: '2024-10-31',
        }),
      })
    );
  });
});
