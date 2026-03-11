/**
 * Tests for metric-selector utility
 * Critical for token budget management - filters columns at tool level
 */

import {
  DEFAULT_METRICS,
  INTENT_DEFAULT_METRICS,
  MINIMUM_METRICS,
  getMetricsForIntent,
  filterDataMetrics,
} from '../metric-selector';

describe('metric-selector', () => {
  describe('DEFAULT_METRICS', () => {
    it('should contain core metrics', () => {
      expect(DEFAULT_METRICS).toContain('Revenue');
      expect(DEFAULT_METRICS).toContain('Spent');
      expect(DEFAULT_METRICS).toContain('Profit');
      expect(DEFAULT_METRICS).toContain('ROI%');
    });
  });

  describe('INTENT_DEFAULT_METRICS', () => {
    it('should have metrics for analytics intent', () => {
      expect(INTENT_DEFAULT_METRICS.analytics).toContain('Revenue');
      expect(INTENT_DEFAULT_METRICS.analytics).toContain('ROI%');
      expect(INTENT_DEFAULT_METRICS.analytics).toContain('CPC');
    });

    it('should have empty metrics for metadata_only intent', () => {
      expect(INTENT_DEFAULT_METRICS.metadata_only).toEqual([]);
    });

    it('should have empty metrics for non_analytics intent', () => {
      expect(INTENT_DEFAULT_METRICS.non_analytics).toEqual([]);
    });
  });

  describe('MINIMUM_METRICS', () => {
    it('should contain core metrics for summary agent context', () => {
      expect(MINIMUM_METRICS).toContain('Revenue');
      expect(MINIMUM_METRICS).toContain('Spent');
      expect(MINIMUM_METRICS).toContain('Profit');
      expect(MINIMUM_METRICS).toContain('ROI%');
    });
  });

  describe('getMetricsForIntent', () => {
    it('should always include MINIMUM_METRICS even with user selection', () => {
      const result = getMetricsForIntent('analytics', ['CPC', 'CTR%']);
      // Should include minimum metrics + user-requested
      expect(result).toContain('Revenue');
      expect(result).toContain('Spent');
      expect(result).toContain('Profit');
      expect(result).toContain('ROI%');
      expect(result).toContain('CPC');
      expect(result).toContain('CTR%');
    });

    it('should return minimum + intent defaults when no user selection', () => {
      const result = getMetricsForIntent('analytics');
      // Should include minimum metrics
      expect(result).toContain('Revenue');
      expect(result).toContain('Spent');
      expect(result).toContain('Profit');
      expect(result).toContain('ROI%');
      // Plus intent defaults
      expect(result).toContain('Clicks');
      expect(result).toContain('CPC');
    });

    it('should return minimum + intent defaults when empty user selection', () => {
      const result = getMetricsForIntent('analytics', []);
      // Should include minimum metrics
      expect(result).toContain('Revenue');
      expect(result).toContain('ROI%');
      // Plus intent defaults
      expect(result).toContain('CPC');
    });

    it('should return minimum + DEFAULT_METRICS for unknown intent', () => {
      const result = getMetricsForIntent('unknown_intent');
      expect(result).toContain('Revenue');
      expect(result).toContain('Spent');
      expect(result).toContain('Profit');
      expect(result).toContain('ROI%');
    });
  });

  describe('filterDataMetrics', () => {
    const mockData = [
      { Name: 'Campaign A', ID: 'id1', Revenue: 1000, Spent: 500, Profit: 500, ROI: 100, CPC: 0.5, CTR: 2.5, ExtraField: 'ignored' },
      { Name: 'Campaign B', ID: 'id2', Revenue: 2000, Spent: 800, Profit: 1200, ROI: 150, CPC: 0.3, CTR: 3.0, ExtraField: 'ignored' },
    ];

    it('should preserve identity fields (Name, ID)', () => {
      const result = filterDataMetrics(mockData, ['Revenue']);
      expect(result[0]).toHaveProperty('Name', 'Campaign A');
      expect(result[0]).toHaveProperty('ID', 'id1');
    });

    it('should include specified metrics', () => {
      const result = filterDataMetrics(mockData, ['Revenue', 'Spent']);
      expect(result[0]).toHaveProperty('Revenue', 1000);
      expect(result[0]).toHaveProperty('Spent', 500);
    });

    it('should always include MINIMUM_METRICS even if not specified', () => {
      const result = filterDataMetrics(mockData, ['CPC']);
      // Should have minimum metrics
      expect(result[0]).toHaveProperty('Revenue');
      expect(result[0]).toHaveProperty('Spent');
      expect(result[0]).toHaveProperty('Profit');
      // Plus requested metric
      expect(result[0]).toHaveProperty('CPC');
    // But not extra fields
      expect(result[0]).not.toHaveProperty('ExtraField');
    });

    it('should handle empty data array', () => {
      const result = filterDataMetrics([], ['Revenue']);
      expect(result).toEqual([]);
    });

    it('should preserve Date field for trend data', () => {
      const trendData = [
        { Date: '2025-12-01', Campaign: 'Camp A', Revenue: 100 },
      ];
      const result = filterDataMetrics(trendData, ['Revenue']);
      expect(result[0]).toHaveProperty('Date', '2025-12-01');
      expect(result[0]).toHaveProperty('Campaign', 'Camp A');
    });
  });

});
