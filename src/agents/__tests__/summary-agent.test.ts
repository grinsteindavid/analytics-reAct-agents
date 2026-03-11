/**
 * Tests for SummaryAgent
 * Tests AI-powered summary generation from analytics results
 */

// Mock all external dependencies BEFORE imports
jest.mock('@langchain/openai');
jest.mock('../../utils/debug-logger', () => ({
  logSummaryGeneration: jest.fn(),
  logSummaryInput: jest.fn(),
  logStep: jest.fn(),
}));
jest.mock('../../utils/collect-all-data', () => ({
  collectAllData: jest.fn(),
  buildCollectionDebugInfo: jest.fn(() => ({})),
  logDataCollection: jest.fn(),
}));
jest.mock('../../utils/confidence-calculator', () => ({
  calculateOverallConfidence: jest.fn(() => 0.85),
}));
jest.mock('../../utils/uncertainty-collector', () => ({
  collectUncertaintyReasons: jest.fn(() => []),
}));

import { ChatOpenAI } from '@langchain/openai';
import { SummaryAgent } from '../summary-agent';
import { CampaignAnalysisState } from '../../types/state';
import { collectAllData } from '../../utils/collect-all-data';

const MockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;
const mockCollectAllData = collectAllData as jest.MockedFunction<typeof collectAllData>;

describe('SummaryAgent', () => {
  let agent: SummaryAgent;
  let mockLLM: jest.Mocked<ChatOpenAI>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for collectAllData - returns empty data
    mockCollectAllData.mockReturnValue({ rows: [], sources: [] });

    // Mock LLM instance with withStructuredOutput
    mockLLM = {
      invoke: jest.fn(),
      withStructuredOutput: jest.fn().mockReturnThis(),
    } as any;

    (mockLLM.withStructuredOutput as jest.Mock).mockReturnValue(mockLLM);
    MockChatOpenAI.mockImplementation(() => mockLLM);

    agent = new SummaryAgent('gpt-4o-mini');
  });

  describe('Constructor', () => {
    it('should initialize with correct model and temperature', () => {
      expect(MockChatOpenAI).toHaveBeenCalledWith({
        modelName: 'gpt-4o-mini',
        temperature: 0.3,
      });
    });

    it('should use default model when not provided', () => {
      jest.clearAllMocks();
      new SummaryAgent();

      expect(MockChatOpenAI).toHaveBeenCalledWith({
        modelName: 'gpt-4o-mini',
        temperature: 0.3,
      });
    });

    it('should accept custom model name', () => {
      jest.clearAllMocks();
      new SummaryAgent('gpt-4o');

      expect(MockChatOpenAI).toHaveBeenCalledWith({
        modelName: 'gpt-4o',
        temperature: 0.3,
      });
    });
  });

  describe('generateSummary', () => {
    let mockState: CampaignAnalysisState;
    const defaultDrilldownData = [
      { Name: 'Campaign A', Revenue: 5000, ROI: 300 },
      { Name: 'Campaign B', Revenue: 4500, ROI: 280 },
      { Name: 'Campaign C', Revenue: 4000, ROI: 250 },
    ];

    beforeEach(() => {
      mockState = {
        question: 'Best 5 campaigns from Google',
        intent: 'analytics',
        entities: [],
        extractedParams: { limit: 5, trafficSource: 'GOOGLE' },
        drilldownData: defaultDrilldownData,
        metadata: {
          llmCalls: 1,
          toolCalls: 2,
          startTime: Date.now(),
          timings: [],
        },
      } as any;

      // Set up collectAllData to return the test drilldown data
      mockCollectAllData.mockReturnValue({
        rows: defaultDrilldownData,
        sources: ['drilldown'],
      });
    });

    it('should generate summary from drilldown data', async () => {
      const mockSummary = {
        summary: 'Top 3 campaigns generated $13,500 total revenue.',
        keyInsights: [
          'Campaign A: $5,000 revenue, 300% ROI',
          'Campaign B: $4,500 revenue, 280% ROI',
        ],
        dataIncomplete: false,
      };

      mockLLM.invoke.mockResolvedValue(mockSummary);

      const result = await agent.generateSummary(mockState);

      expect(mockLLM.invoke).toHaveBeenCalledTimes(1);
      expect(result.result).toMatchObject({
        summary: mockSummary.summary,
        keyInsights: mockSummary.keyInsights,
        totalRows: 3,
      });
      expect(result.metadata?.llmCalls).toBe(2); // Incremented
    });

    it('should truncate data to 200 rows and mark as incomplete', async () => {
      // Create 250 rows of data
      const largeData = Array.from({ length: 250 }, (_, i) => ({
        Name: `Campaign ${i}`,
        Revenue: 1000 + i,
      }));

      mockState.drilldownData = largeData;
      mockCollectAllData.mockReturnValue({
        rows: largeData,
        sources: ['drilldown'],
      });

      mockLLM.invoke.mockResolvedValue({
        summary: 'Summary of top campaigns',
        keyInsights: ['Insight 1'],
        dataIncomplete: true,
      });

      const result = await agent.generateSummary(mockState);

      // Verify dataIncomplete is set when rows exceed 200
      expect(result.result?.dataIncomplete).toBe(true);
    });

    it('should use campaign details if drilldown data is not available', async () => {
      const entityData = [{ _id: '123', name: 'Campaign X', status: 'active' }];
      mockState.drilldownData = undefined;
      mockState.entityLookupData = entityData;
      mockCollectAllData.mockReturnValue({
        rows: entityData,
        sources: ['entityLookup'],
      });

      mockLLM.invoke.mockResolvedValue({
        summary: 'Campaign details summary',
        keyInsights: ['1 active campaign'],
        dataIncomplete: false,
      });

      const result = await agent.generateSummary(mockState);

      expect(result.result?.totalRows).toBe(1);
      expect(mockLLM.invoke).toHaveBeenCalled();
    });

    it('should include SUMMARY_GENERATOR_PROMPT in system message', async () => {
      mockLLM.invoke.mockResolvedValue({
        summary: 'Test',
        keyInsights: [],
        dataIncomplete: false,
      });

      await agent.generateSummary(mockState);

      const invokeCall = mockLLM.invoke.mock.calls[0]?.[0] as any;
      const systemMessage = invokeCall?.[0];

      expect(systemMessage.role).toBe('system');
      expect(systemMessage.content).toContain('data summarizer');
    });

    it('should handle LLM errors gracefully', async () => {
      mockLLM.invoke.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await agent.generateSummary(mockState);

      expect(result.error).toBe('API rate limit exceeded');
      expect(result.result?.summary).toBe('Summary generation failed. Showing raw data.');
      expect(result.drilldownData).toHaveLength(3);
      expect(result.metadata?.llmCalls).toBe(2); // Still incremented
    });

    it('should preserve metadata timings', async () => {
      mockState.metadata.timings = [
        { step: 'classify', type: 'llm', duration: 100, timestamp: Date.now() },
      ];

      mockLLM.invoke.mockResolvedValue({
        summary: 'Test',
        keyInsights: [],
        dataIncomplete: false,
      });

      const result = await agent.generateSummary(mockState);

      expect(result.metadata?.timings).toHaveLength(2);
      expect(result.metadata?.timings?.[1]?.step).toBe('generate_summary');
      expect(result.metadata?.timings?.[1]?.type).toBe('llm');
    });

    it('should handle empty data gracefully', async () => {
      mockState.drilldownData = [];
      mockState.entityLookupData = [];
      mockCollectAllData.mockReturnValue({ rows: [], sources: [] });

      mockLLM.invoke.mockResolvedValue({
        summary: 'No data available',
        keyInsights: [],
        dataIncomplete: false,
      });

      const result = await agent.generateSummary(mockState);

      expect(result.result?.totalRows).toBe(0);
    });

    it('should increment LLM call counter', async () => {
      mockState.metadata.llmCalls = 5;

      mockLLM.invoke.mockResolvedValue({
        summary: 'Test',
        keyInsights: [],
        dataIncomplete: false,
      });

      const result = await agent.generateSummary(mockState);

      expect(result.metadata?.llmCalls).toBe(6);
    });
  });
});
