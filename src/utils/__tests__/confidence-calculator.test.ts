/**
 * Tests for confidence calculator utility
 */
import { 
  calculateOverallConfidence, 
  collectConfidenceFactors, 
  computeAverageConfidence,
  ConfidenceFactors 
} from '../confidence-calculator';
import { CampaignAnalysisState } from '../../types/state';
import { SummaryOutput } from '../../agents/summary-agent';

// Mock collectAllData to avoid dependency on state structure
jest.mock('../collect-all-data', () => ({
  collectAllData: jest.fn(() => ({ rows: [{}], sources: ['test'] })),
}));

describe('confidence-calculator', () => {
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

  describe('computeAverageConfidence', () => {
    it('should return default 0.85 for empty factors', () => {
      const result = computeAverageConfidence({});
      expect(result).toBe(0.85);
    });

    it('should compute average of single factor', () => {
      const result = computeAverageConfidence({ intentConfidence: 0.9 });
      expect(result).toBe(0.9);
    });

    it('should compute average of multiple factors', () => {
      const result = computeAverageConfidence({
        intentConfidence: 0.8,
        evaluatorConfidence: 0.7,
      });
      expect(result).toBe(0.75);
    });

    it('should round to 2 decimal places', () => {
      const result = computeAverageConfidence({
        intentConfidence: 0.333,
        evaluatorConfidence: 0.666,
        llmConfidence: 0.777,
      });
      expect(result).toBe(0.59);
    });

    it('should ignore undefined factors', () => {
      const factors: ConfidenceFactors = {
        intentConfidence: 0.8,
        evaluatorConfidence: undefined,
        llmConfidence: 0.6,
      };
      const result = computeAverageConfidence(factors);
      expect(result).toBe(0.7);
    });
  });

  describe('collectConfidenceFactors', () => {
    it('should collect intent confidence', () => {
      const state = createMockState({ intentConfidence: 0.95 });
      const summary = createMockSummary();

      const factors = collectConfidenceFactors(state, summary, false);

      expect(factors.intentConfidence).toBe(0.95);
    });

    it('should collect evaluator confidence', () => {
      const state = createMockState({
        evaluationResult: { decision: 'summarize' as const, confidence: 0.85, reasoning: 'Good', missingData: null },
      });
      const summary = createMockSummary();

      const factors = collectConfidenceFactors(state, summary, false);

      expect(factors.evaluatorConfidence).toBe(0.85);
    });

    it('should add data completeness penalty when data is incomplete', () => {
      const state = createMockState();
      const summary = createMockSummary();

      const factors = collectConfidenceFactors(state, summary, true);

      expect(factors.dataCompleteness).toBe(0.7);
    });

    it('should not add data completeness factor when data is complete', () => {
      const state = createMockState();
      const summary = createMockSummary();

      const factors = collectConfidenceFactors(state, summary, false);

      expect(factors.dataCompleteness).toBeUndefined();
    });

    it('should collect LLM confidence from summary', () => {
      const state = createMockState();
      const summary = createMockSummary({ confidence: 0.92 });

      const factors = collectConfidenceFactors(state, summary, false);

      expect(factors.llmConfidence).toBe(0.92);
    });

    it('should collect all available factors', () => {
      const state = createMockState({
        intentConfidence: 0.9,
        evaluationResult: { decision: 'summarize' as const, confidence: 0.8, reasoning: 'OK', missingData: null },
      });
      const summary = createMockSummary({ confidence: 0.85 });

      const factors = collectConfidenceFactors(state, summary, true);

      expect(factors.intentConfidence).toBe(0.9);
      expect(factors.evaluatorConfidence).toBe(0.8);
      expect(factors.dataCompleteness).toBe(0.7);
      expect(factors.llmConfidence).toBe(0.85);
    });
  });

  describe('calculateOverallConfidence', () => {
    it('should return default confidence for minimal state', () => {
      const state = createMockState();
      const summary = createMockSummary();

      const result = calculateOverallConfidence(state, summary, false);

      expect(result).toBe(0.85);
    });

    it('should compute weighted average of all factors', () => {
      const state = createMockState({
        intentConfidence: 0.9,
        evaluationResult: { decision: 'summarize' as const, confidence: 0.8, reasoning: 'OK', missingData: null },
      });
      const summary = createMockSummary({ confidence: 0.85 });

      const result = calculateOverallConfidence(state, summary, false);

      // (0.9 + 0.8 + 0.85) / 3 = 0.85
      expect(result).toBe(0.85);
    });

    it('should lower confidence when data is incomplete', () => {
      const state = createMockState({ intentConfidence: 0.9 });
      const summary = createMockSummary({ confidence: 0.9 });

      const result = calculateOverallConfidence(state, summary, true);

      // (0.9 + 0.7 + 0.9) / 3 = 0.833... ≈ 0.83
      expect(result).toBe(0.83);
    });
  });
});
