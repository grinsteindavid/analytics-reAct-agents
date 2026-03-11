/**
 * Tests for drilldown-tool
 * Following Jest mocking best practices:
 * - Mock ONLY dependencies (processReport), NOT the tool itself
 * - Test the REAL tool with mocked dependencies
 * 
 * Architecture: Now using Redshift via processReport (datasource: 'beta')
 * Note: Drilldown tool uses single dimension (1D) - 2D was removed
 */

// Mock dependencies BEFORE imports
jest.mock('../../data-access/postgres/drilldown-query', () => ({
  processReport: jest.fn(),
}));
jest.mock('../../data-access/redis/cache-helper', () => ({
  CacheHelper: {
    withCache: jest.fn((_key: string, _params: any, fn: () => Promise<any>) => fn().then((result: any) => ({ result, cached: false }))),
  },
}));

import { processReport } from '../../data-access/postgres/drilldown-query';
import { createDrilldownTool } from '../drilldown-tool';
import { DatabaseContext } from '../../types/context';

// Cast mocks
const mockProcessReport = processReport as jest.MockedFunction<typeof processReport>;

describe('DrilldownTool', () => {
  let mockContext: DatabaseContext;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database context - Redshift via processReport, no MSSQL needed
    mockContext = {
      mongoose: {} as any,
      mongooseConnection: {} as any,
    };
  });

  it('should execute drilldown report successfully', async () => {
    // Arrange - Use fields that match IDENTITY_FIELDS and default metrics
    const mockData = [
      { Name: 'Test Campaign', ID: '123', Revenue: 1000, Spent: 500, Profit: 500, 'ROI%': 100, Clicks: 200, CVRs: 10, 'CR%': 5 },
      { Name: 'Another Campaign', ID: '456', Revenue: 800, Spent: 400, Profit: 400, 'ROI%': 100, Clicks: 150, CVRs: 8, 'CR%': 5.3 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: {
        group_by: 'Campaign' as const,
      },
      dates: {
        based_on: 'created_on' as const,
        from: '11/01/2024',
        to: '11/18/2024',
      },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(2); // Data is filtered to default metrics
    expect(parsed.totalRows).toBe(2);
    expect(parsed.groupBy).toEqual('Campaign');
    expect(parsed.queryContext).toBeDefined(); // New: queryContext for checkpointer
    expect(mockProcessReport).toHaveBeenCalledTimes(1);
    // Verify it was called with IReport structure (group_by wrapped in array for backend)
    expect(mockProcessReport).toHaveBeenCalledWith(expect.objectContaining({
      save: true, // Must be true for drilldown to work
      name: null,
      options: expect.objectContaining({
        group_by: ['Campaign'], // Wrapped in array for backend
      }),
    }));
  });

  it('should handle errors gracefully', async () => {
    // Arrange
    mockProcessReport.mockRejectedValue(new Error('Database connection failed'));

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Campaign' },
      dates: { based_on: 'created_on', from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Database connection failed');
  });

  // Note: MSSQL connection test removed - now using Redshift via processReport

  it('should handle empty results', async () => {
    // Arrange
    mockProcessReport.mockResolvedValue([] as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Campaign' },
      dates: { based_on: 'created_on', from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([]);
    expect(parsed.totalRows).toBe(0);
  });

  it('should return drilldown results with Total row', async () => {
    // Arrange - Real drilldown structure with Total row first, using default metrics
    const mockData = [
      { Name: 'Total', ID: 'Total', Clicks: 644, Revenue: 0, Spent: 46.86, Profit: -46.86, 'ROI%': 0, CVRs: 0, 'CR%': 0 },
      { Name: 'Campaign 1', ID: '689a7917a9547657dd6ce91c', Clicks: 255, Revenue: 0, Spent: 20, Profit: -20, 'ROI%': 0, CVRs: 0, 'CR%': 0 },
      { Name: 'Campaign 2', ID: '689a7917a9547657dd6ce92d', Clicks: 389, Revenue: 0, Spent: 26.86, Profit: -26.86, 'ROI%': 0, CVRs: 0, 'CR%': 0 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Campaign' },
      dates: { based_on: 'created_on', from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data[0].ID).toBe('Total'); // Total row is first
    expect(parsed.data[0].Clicks).toBe(644); // Total aggregation
    expect(parsed.totalRows).toBe(3);
    expect(parsed.groupBy).toEqual('Campaign');
  });

  it('should handle drilldown with filters', async () => {
    // Arrange
    const mockData = [
      { Name: 'Total', ID: 'Total', Clicks: 100 },
      { Name: 'Google Campaign', ID: '123', Clicks: 100 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [{
        type: 'TrafficSource' as const, // Must match FILTER_TYPES enum
        ids: ['507f1f77bcf86cd799439011'], // TrafficSource ID
      }],
      options: { group_by: 'Campaign' as const },
      dates: { based_on: 'created_on' as const, from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(mockProcessReport).toHaveBeenCalledWith(expect.objectContaining({
      save: true,
      name: null,
      filters: expect.arrayContaining([expect.objectContaining({ type: 'TrafficSource' })]),
    }));
  });

  it('should handle drilldown with metric conditions', async () => {
    // Arrange
    const mockData = [
      { Name: 'Total', ID: 'Total', Clicks: 5000, Revenue: 2500 },
      { Name: 'High Performer', ID: '123', Clicks: 5000, Revenue: 2500 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [{
        type: 'Campaign' as const,
        conditions: [{
          metric: 'Clicks' as const, // Must be from METRIC_NAMES enum
          type: 'Is Greater Than' as const,
          value: 1000,
        }],
      }],
      options: { group_by: 'Campaign' as const },
      dates: { based_on: 'created_on' as const, from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(mockProcessReport).toHaveBeenCalledWith(expect.objectContaining({
      save: true,
      name: null,
      filters: expect.arrayContaining([
        expect.objectContaining({
          type: 'Campaign',
          conditions: expect.arrayContaining([
            expect.objectContaining({ metric: 'Clicks', type: 'Is Greater Than', value: 1000 }),
          ]),
        }),
      ]),
    }));
  });

  it('should handle drilldown with date ranges', async () => {
    // Arrange
    const mockData = [
      { Name: 'Total', ID: 'Total', Clicks: 500 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Date' as const },
      dates: {
        based_on: 'created_on' as const,
        from: '10/01/2024',
        to: '10/31/2024',
        time_offset: -5,
      },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(mockProcessReport).toHaveBeenCalledWith(expect.objectContaining({
      save: true,
      name: null,
      dates: expect.objectContaining({
        from: '10/01/2024',
        to: '10/31/2024',
        time_offset: 5, // Default is 5, not -5
        moment_name: 'EST5EDT',
      }),
    }));
  });

  it('should handle empty results correctly', async () => {
    // Arrange
    mockProcessReport.mockResolvedValue([] as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Campaign' },
      dates: { based_on: 'created_on', from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual([]);
    expect(parsed.totalRows).toBe(0);
    expect(parsed.groupBy).toEqual('Campaign');
  });

  it('should handle only Total row (no data rows)', async () => {
    // Arrange - include default metrics
    const mockData = [
      { Name: 'Total', ID: 'Total', Clicks: 0, Revenue: 0, Spent: 0, Profit: 0, 'ROI%': 0, CVRs: 0, 'CR%': 0 },
    ];
    mockProcessReport.mockResolvedValue(mockData as any);

    const tool = createDrilldownTool(mockContext);

    const input = {
      filters: [],
      options: { group_by: 'Campaign' },
      dates: { based_on: 'created_on', from: '11/01/2024', to: '11/18/2024' },
    };

    // Act
    const result = await tool.invoke(input as any);
    const parsed = JSON.parse(result);

    // Assert
    expect(parsed.success).toBe(true);
    expect(parsed.totalRows).toBe(1);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].ID).toBe('Total'); // Only Total row present
    expect(parsed.groupBy).toEqual('Campaign');
  });

  describe('Date Range Presets', () => {
    it('should parse "today" preset to actual dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 100 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'created_on', dateRange: 'today' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(calledWith?.dates.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should parse "yesterday" preset to actual dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 50 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'conversion_date', dateRange: 'yesterday' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(calledWith?.dates.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should parse "last_7_days" preset to actual dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 700 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'created_on', dateRange: 'last_7_days' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(calledWith?.dates.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should parse "last_30_days" preset to actual dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 3000 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'created_on', dateRange: 'last_30_days' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(calledWith?.dates.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should parse "this_month" preset to actual dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 1500 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'created_on', dateRange: 'this_month' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(calledWith?.dates.to).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('should still accept custom from/to dates', async () => {
      // Arrange
      const mockData = [{ Name: 'Total', ID: 'Total', Clicks: 200 }];
      mockProcessReport.mockResolvedValue(mockData as any);

      const tool = createDrilldownTool(mockContext);
      const input = {
        filters: [],
        options: { group_by: 'Campaign' },
        dates: { based_on: 'created_on', from: '10/01/2024', to: '10/31/2024' },
      };

      // Act
      const result = await tool.invoke(input as any);
      const parsed = JSON.parse(result);

      // Assert
      expect(parsed.success).toBe(true);
      const calledWith = mockProcessReport.mock.calls[0]?.[0];
      expect(calledWith?.dates.from).toBe('10/01/2024');
      expect(calledWith?.dates.to).toBe('10/31/2024');
    });
  });
});
