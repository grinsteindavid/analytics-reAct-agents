/**
 * Tests for uncertainty collector utility
 */
// Mock collectAllData before imports
jest.mock('../collect-all-data', () => ({
  collectAllData: jest.fn(() => ({ rows: [{}], sources: ['test'] })),
}));

import { collectUncertaintyReasons } from '../uncertainty-collector';
import { collectAllData } from '../collect-all-data';
import { CampaignAnalysisState } from '../../types/state';
import { SummaryOutput } from '../../agents/summary-agent';

const mockCollectAllData = collectAllData as jest.MockedFunction<typeof collectAllData>;

describe('collectUncertaintyReasons', () => {
  const createMockState = (overrides: Partial<CampaignAnalysisState> = {}): CampaignAnalysisState => ({
    question: 'test',
    intent: 'analytics',
    entities: [],
    metadata: { llmCalls: 0, toolCalls: 0 },
    ...overrides,
  } as CampaignAnalysisState);

  const createMockSummary = (overrides: Partial<SummaryOutput> = {}): SummaryOutput => ({
    summary: 'Test summary',
    keyInsights: [],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollectAllData.mockReturnValue({ rows: [{}], sources: ['test'] });
  });

  describe('intent confidence', () => {
    it('should add reason when intent confidence is low', () => {
      const state = createMockState({ intentConfidence: 0.6 });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toContain('Ambiguous question intent');
    });

    it('should use custom ambiguity reason when provided', () => {
      const state = createMockState({
        intentConfidence: 0.5,
        intentAmbiguityReason: 'Question could be analytics or metadata',
      });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toContain('Question could be analytics or metadata');
      expect(reasons).not.toContain('Ambiguous question intent');
    });

    it('should not add reason when intent confidence is high', () => {
      const state = createMockState({ intentConfidence: 0.9 });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).not.toContain('Ambiguous question intent');
    });

    it('should not add reason when intent confidence is exactly 0.8', () => {
      const state = createMockState({ intentConfidence: 0.8 });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).not.toContain('Ambiguous question intent');
    });
  });

  describe('evaluator confidence', () => {
    it('should add reason when evaluator confidence is low', () => {
      const state = createMockState({
        evaluationResult: { decision: 'summarize' as const, confidence: 0.5, reasoning: 'Uncertain', missingData: null },
      });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toContain('Evaluator uncertain about data sufficiency');
    });

    it('should not add reason when evaluator confidence is high', () => {
      const state = createMockState({
        evaluationResult: { decision: 'summarize' as const, confidence: 0.85, reasoning: 'Good', missingData: null },
      });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).not.toContain('Evaluator uncertain about data sufficiency');
    });
  });

  describe('data completeness', () => {
    it('should add reason when data is incomplete', () => {
      const state = createMockState();
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, true);

      expect(reasons).toContain('Data truncated due to size limits');
    });

    it('should not add reason when data is complete', () => {
      const state = createMockState();
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).not.toContain('Data truncated due to size limits');
    });
  });

  describe('data availability', () => {
    it('should add reason when no data is available', () => {
      mockCollectAllData.mockReturnValue({ rows: [], sources: [] });

      const state = createMockState();
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toContain('No data returned from queries');
    });

    it('should not add reason when rows are available', () => {
      mockCollectAllData.mockReturnValue({ rows: [{}], sources: ['test'] });

      const state = createMockState();
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).not.toContain('No data returned from queries');
    });

  });

  describe('LLM uncertainty reasons', () => {
    it('should include LLM-provided uncertainty reasons', () => {
      const state = createMockState();
      const summary = createMockSummary({
        uncertaintyReasons: ['Missing campaign data', 'Incomplete date range'],
      });

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toContain('Missing campaign data');
      expect(reasons).toContain('Incomplete date range');
    });

    it('should handle empty LLM uncertainty reasons', () => {
      const state = createMockState();
      const summary = createMockSummary({ uncertaintyReasons: [] });

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toHaveLength(0);
    });
  });

  describe('combined reasons', () => {
    it('should collect all applicable reasons', () => {
      mockCollectAllData.mockReturnValue({ rows: [], sources: [] });

      const state = createMockState({
        intentConfidence: 0.5,
        evaluationResult: { decision: 'replan' as const, confidence: 0.4, reasoning: 'Need more data', missingData: null },
      });
      const summary = createMockSummary({
        uncertaintyReasons: ['LLM uncertainty'],
      });

      const reasons = collectUncertaintyReasons(state, summary, true);

      expect(reasons).toHaveLength(5);
      expect(reasons).toContain('Ambiguous question intent');
      expect(reasons).toContain('Evaluator uncertain about data sufficiency');
      expect(reasons).toContain('Data truncated due to size limits');
      expect(reasons).toContain('No data returned from queries');
      expect(reasons).toContain('LLM uncertainty');
    });

    it('should return empty array when everything is fine', () => {
      const state = createMockState({
        intentConfidence: 0.95,
        evaluationResult: { decision: 'summarize' as const, confidence: 0.9, reasoning: 'All good', missingData: null },
      });
      const summary = createMockSummary();

      const reasons = collectUncertaintyReasons(state, summary, false);

      expect(reasons).toHaveLength(0);
    });
  });
});
