/**
 * Tests for collectAllData utility
 */
import { collectAllData, buildCollectionDebugInfo, CollectedData } from '../collect-all-data';
import { CampaignAnalysisState } from '../../types/state';

describe('collectAllData', () => {
  const createMockState = (overrides: Partial<CampaignAnalysisState> = {}): CampaignAnalysisState => ({
    question: 'test question',
    intent: 'analytics',
    entities: [],
    metadata: { llmCalls: 0, toolCalls: 0 },
    ...overrides,
  } as CampaignAnalysisState);

  describe('empty state', () => {
    it('should return empty arrays for empty state', () => {
      const state = createMockState();
      const result = collectAllData(state);

      expect(result.rows).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
    });
  });

  describe('accumulatedData collection', () => {
    it('should collect rows from drilldown accumulated data', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'Get top campaigns',
            reason: 'Need campaign data',
            data: [{ Name: 'Campaign 1' }, { Name: 'Campaign 2' }],
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(2);
      expect(result.sources).toContain('accumulated:drilldown');
    });

    it('should collect trend-style data from drilldown with time dimension', () => {
    // Trend data now comes through as drilldown type with time dimension in groupBy
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'Get trend data',
            reason: 'Need trends',
            data: [{ Date: '2025-01-01', Campaign: 'Test', Revenue: 1000 }],
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(1);
      expect(result.sources).toContain('accumulated:drilldown');
    });

    it('should collect from multiple accumulated items', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'Get offers',
            reason: 'Need offers',
            data: [{ Name: 'Offer 1' }],
            entities: [],
            timestamp: Date.now(),
          },
          {
            type: 'drilldown',
            instruction: 'Get regions',
            reason: 'Need regions',
            data: [{ Name: 'Region 1' }, { Name: 'Region 2' }],
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(3);
      expect(result.sources).toEqual(['accumulated:drilldown', 'accumulated:drilldown']);
    });

    it('should skip entity_lookup type (metadata only, no metrics)', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'entity_lookup',
            instruction: 'Find Google',
            reason: 'Need traffic source',
            data: [{ Name: 'Google', ID: '123' }],
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      // entity_lookup is metadata, not metrics - should be skipped
      expect(result.rows).toHaveLength(0);
      expect(result.sources).not.toContain('accumulated:entity_lookup');
    });
  });

  describe('legacy direct state fields', () => {
    it('should collect from drilldownData', () => {
      const state = createMockState({
        drilldownData: [{ Name: 'Campaign 1' }, { Name: 'Campaign 2' }],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(2);
      expect(result.sources).toContain('drilldown');
    });

    it('should collect from entityLookupData', () => {
      const state = createMockState({
        entityLookupData: [{ Name: 'Entity 1' }],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(1);
      expect(result.sources).toContain('entityLookup');
    });

  });

  describe('priority handling', () => {
    it('should use accumulatedData exclusively when present (no combining with direct sources)', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'From planner',
            reason: 'Plan step',
            data: [{ Name: 'Accumulated 1' }],
            entities: [],
            timestamp: Date.now(),
          },
        ],
        drilldownData: [{ Name: 'Direct 1' }],  // Should be ignored when accumulatedData exists
      });

      const result = collectAllData(state);

      // accumulatedData is exclusive - direct sources are ignored to avoid duplicates
      expect(result.rows).toHaveLength(1);
      expect(result.sources).toContain('accumulated:drilldown');
      expect(result.sources).not.toContain('drilldown');
    });
  });

  describe('edge cases', () => {
    it('should handle non-array data in drilldown items', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'Single row',
            reason: 'Edge case',
            data: { Name: 'Single Campaign', ID: '1' },
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({ Name: 'Single Campaign', ID: '1' });
    });

    it('should skip accumulated items with null data', () => {
      const state = createMockState({
        accumulatedData: [
          {
            type: 'drilldown',
            instruction: 'Failed query',
            reason: 'No data',
            data: null,
            entities: [],
            timestamp: Date.now(),
          },
        ],
      });

      const result = collectAllData(state);

      expect(result.rows).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
    });
  });
});

describe('buildCollectionDebugInfo', () => {
  it('should build correct debug info', () => {
    const state = {
      accumulatedData: [
        { type: 'drilldown', instruction: '', reason: '', data: [{}, {}], entities: [], timestamp: 0 },
      ],
      drilldownData: [{}, {}, {}],
      entityLookupData: [{}],
      conversationHistory: [{}, {}],
    } as any;

    const result: CollectedData = {
      rows: [{}, {}, {}, {}, {}],
      sources: ['accumulated:drilldown', 'drilldown', 'entityLookup'],
    };

    const debugInfo = buildCollectionDebugInfo(state, result);

    expect(debugInfo.accumulatedDataCount).toBe(1);
    expect(debugInfo.drilldownDataCount).toBe(3);
    expect(debugInfo.entityLookupDataCount).toBe(1);
    expect(debugInfo.conversationHistoryCount).toBe(2);
    expect(debugInfo.sourcesUsed).toEqual(['accumulated:drilldown', 'drilldown', 'entityLookup']);
    expect(debugInfo.totalRows).toBe(5);
  });

  it('should handle empty state', () => {
    const state = {} as any;
    const result: CollectedData = { rows: [], sources: [] };

    const debugInfo = buildCollectionDebugInfo(state, result);

    expect(debugInfo.accumulatedDataCount).toBe(0);
    expect(debugInfo.drilldownDataCount).toBe(0);
    expect(debugInfo.entityLookupDataCount).toBe(0);
    expect(debugInfo.conversationHistoryCount).toBe(0);
    expect(debugInfo.totalRows).toBe(0);
  });
});
