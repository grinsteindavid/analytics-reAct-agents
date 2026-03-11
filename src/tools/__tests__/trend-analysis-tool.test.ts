/**
 * Tests for trend-analysis-tool-redshift
 * Following Jest mocking best practices:
 * - Mock ONLY dependencies, NOT the tool itself
 * - Test the REAL tool with mocked dependencies
 */

// Mock dependencies BEFORE imports
jest.mock('../../data-access/postgres/drilldown-query', () => ({
    multiDimensionDrilldown: jest.fn(),
    flattenDrilldownResults: jest.fn(),
}));

jest.mock('../../data-access/redis/cache-helper', () => ({
    CacheHelper: {
        withCache: jest.fn((_key: string, _params: any, fn: () => Promise<any>) => fn().then((result: any) => ({ result, cached: false }))),
    },
}));

import {
    multiDimensionDrilldown,
    flattenDrilldownResults,
} from '../../data-access/postgres/drilldown-query';
import { createTrendAnalysisRedshiftTool } from '../trend-analysis-tool-redshift';
import { DatabaseContext } from '../../types/context';

// Cast mocks
const mockMultiDimensionDrilldown = multiDimensionDrilldown as jest.MockedFunction<
    typeof multiDimensionDrilldown
>;
const mockFlattenDrilldownResults = flattenDrilldownResults as jest.MockedFunction<
    typeof flattenDrilldownResults
>;

describe('TrendAnalysisRedshiftTool', () => {
    let mockContext: DatabaseContext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            mongoose: {} as any,
            mongooseConnection: {} as any,
        };

        // Default mock behavior
        mockMultiDimensionDrilldown.mockResolvedValue([]);
        mockFlattenDrilldownResults.mockReturnValue([]);
    });

    describe('Basic Execution', () => {
        it('should execute trend analysis successfully', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign 1', ID: '123', Revenue: 1000, Spent: 500, 'ROI%': 100 },
                { Date: '2024-11-01', Name: 'Campaign 2', ID: '456', Revenue: 800, Spent: 400, 'ROI%': 100 },
                { Date: '2024-11-02', Name: 'Campaign 1', ID: '123', Revenue: 1200, Spent: 600, 'ROI%': 100 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: {
                    based_on: 'created_on' as const,
                    from: '11/01/2024',
                    to: '11/18/2024',
                },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toBeDefined();
            expect(parsed.groupBy).toEqual(['Date', 'Campaign']);
            expect(parsed.queryContext).toBeDefined();
            expect(mockMultiDimensionDrilldown).toHaveBeenCalledTimes(1);
        });

        it('should handle errors gracefully', async () => {
            mockMultiDimensionDrilldown.mockRejectedValue(new Error('Redshift connection failed'));

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(false);
            expect(parsed.error).toBe('Redshift connection failed');
        });

        it('should handle empty results', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data).toEqual([]);
            expect(parsed.totalRows).toBe(0);
        });
    });

    describe('filterByEntityLimit', () => {
        it('should limit entities per time period', async () => {
            // 3 campaigns per day, limit to 2
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', 'ROI%': 100 },
                { Date: '2024-11-01', Name: 'Campaign B', ID: 'b', 'ROI%': 80 },
                { Date: '2024-11-01', Name: 'Campaign C', ID: 'c', 'ROI%': 60 },
                { Date: '2024-11-02', Name: 'Campaign A', ID: 'a', 'ROI%': 90 },
                { Date: '2024-11-02', Name: 'Campaign B', ID: 'b', 'ROI%': 70 },
                { Date: '2024-11-02', Name: 'Campaign C', ID: 'c', 'ROI%': 50 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                limit: 2,
                sort: 'ROI%' as const,
                direction: 'desc' as const,
                dates: { from: '11/01/2024', to: '11/02/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            // Should have 2 per day = 4 total
            expect(parsed.data.length).toBe(4);

            // Check day 1 has top 2 by ROI%
            const day1 = parsed.data.filter((r: any) => r.Date === '2024-11-01');
            expect(day1.length).toBe(2);
            expect(day1[0]['ROI%']).toBe(100); // Campaign A
            expect(day1[1]['ROI%']).toBe(80);  // Campaign B
        });

        it('should sort ascending when direction is asc', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', 'ROI%': 100 },
                { Date: '2024-11-01', Name: 'Campaign B', ID: 'b', 'ROI%': 50 },
                { Date: '2024-11-01', Name: 'Campaign C', ID: 'c', 'ROI%': 75 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                limit: 2,
                sort: 'ROI%' as const,
                direction: 'asc' as const,
                dates: { from: '11/01/2024', to: '11/01/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data.length).toBe(2);
            expect(parsed.data[0]['ROI%']).toBe(50);  // Lowest first
            expect(parsed.data[1]['ROI%']).toBe(75);
        });

        it('should handle missing sort metric values', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', 'ROI%': 100 },
                { Date: '2024-11-01', Name: 'Campaign B', ID: 'b' }, // No ROI%
                { Date: '2024-11-01', Name: 'Campaign C', ID: 'c', 'ROI%': 50 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                limit: 3,
                dates: { from: '11/01/2024', to: '11/01/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.data.length).toBe(3);
        });
    });

    describe('Date Range Parsing', () => {
        it('should parse "today" preset', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { dateRange: 'today' as const },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.dateRange).toBeDefined();
            expect(parsed.dateRange.from).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
            expect(parsed.dateRange.to).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        });

        it('should parse "yesterday" preset', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { dateRange: 'yesterday' as const },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.dateRange).toBeDefined();
        });

        it('should parse "last_7_days" preset', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { dateRange: 'last_7_days' as const },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('should parse "last_30_days" preset', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { dateRange: 'last_30_days' as const },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
        });

        it('should accept custom from/to dates', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { from: '10/01/2024', to: '10/31/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.dateRange.from).toBe('10/01/2024');
            expect(parsed.dateRange.to).toBe('10/31/2024');
        });
    });

    describe('Time Dimensions', () => {
        it.each(['Date', 'Month', 'Year', 'Hour'] as const)(
            'should support %s time dimension',
            async (timeDim) => {
                mockMultiDimensionDrilldown.mockResolvedValue([]);

                const tool = createTrendAnalysisRedshiftTool(mockContext);

                const input = {
                    time_dimension: timeDim,
                    dimension: 'Campaign' as const,
                    dates: { from: '11/01/2024', to: '11/18/2024' },
                };

                const result = await tool.invoke(input as any);
                const parsed = JSON.parse(result);

                expect(parsed.success).toBe(true);
                expect(parsed.groupBy[0]).toBe(timeDim);
                expect(mockMultiDimensionDrilldown).toHaveBeenCalledTimes(1);
            }
        );
    });

    describe('Entity Dimensions', () => {
        it.each(['Campaign', 'TrafficSource', 'Offer', 'LandingPage'] as const)(
            'should support %s entity dimension',
            async (entityDim) => {
                mockMultiDimensionDrilldown.mockResolvedValue([]);

                const tool = createTrendAnalysisRedshiftTool(mockContext);

                const input = {
                    time_dimension: 'Date' as const,
                    dimension: entityDim,
                    dates: { from: '11/01/2024', to: '11/18/2024' },
                };

                const result = await tool.invoke(input as any);
                const parsed = JSON.parse(result);

                expect(parsed.success).toBe(true);
                expect(parsed.groupBy[1]).toBe(entityDim);
            }
        );
    });

    describe('Filters and Conditions', () => {
        it('should pass filters to multiDimensionDrilldown', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                filters: [
                    { type: 'TrafficSource' as const, ids: ['ts123'] },
                ],
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(mockMultiDimensionDrilldown).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.arrayContaining([
                        expect.objectContaining({ type: 'TrafficSource', ids: ['ts123'] }),
                    ]),
                })
            );
        });

        it('should pass conditions to multiDimensionDrilldown', async () => {
            mockMultiDimensionDrilldown.mockResolvedValue([]);
            mockFlattenDrilldownResults.mockReturnValue([]);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                conditions: [
                    { metric: 'Clicks' as const, type: 'Is Greater Than' as const, value: 100 },
                ],
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(mockMultiDimensionDrilldown).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: expect.objectContaining({
                        conditions: expect.arrayContaining([
                            expect.objectContaining({ metric: 'Clicks', type: 'Is Greater Than', value: 100 }),
                        ]),
                    }),
                })
            );
        });
    });

    describe('Metric Filtering', () => {
        it('should filter to default metrics when metricsSelection not provided', async () => {
            const mockData = [
                {
                    Date: '2024-11-01',
                    Name: 'Campaign A',
                    ID: 'a',
                    Revenue: 1000,
                    Spent: 500,
                    Profit: 500,
                    'ROI%': 100,
                    Clicks: 200,
                    CVRs: 10,
                    'CR%': 5,
                    ExtraField: 'should be removed',
                },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.queryContext.responseMetadata.metricsIncluded).toBeDefined();
        });

        it('should use custom metricsSelection when provided', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', CPC: 0.5, CTR: 2.5, 'ROI%': 100 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                metricsSelection: ['CPC', 'CTR'],
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            expect(parsed.queryContext.responseMetadata.metricsRequested).toEqual(['CPC', 'CTR']);
        });

        it('should include sort metric even if not in metricsSelection', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', CPC: 0.5, Clicks: 100 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                metricsSelection: ['CPC'],
                sort: 'Clicks' as const,
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.success).toBe(true);
            // Should include both CPC and Clicks (sort metric)
            expect(parsed.queryContext.responseMetadata.metricsIncluded).toContain('CPC');
            expect(parsed.queryContext.responseMetadata.metricsIncluded).toContain('Clicks');
        });
    });

    describe('Query Context', () => {
        it('should return queryContext for checkpointer', async () => {
            const mockData = [
                { Date: '2024-11-01', Name: 'Campaign A', ID: 'a', 'ROI%': 100 },
            ];
            mockMultiDimensionDrilldown.mockResolvedValue(mockData as any);

            const tool = createTrendAnalysisRedshiftTool(mockContext);

            const input = {
                time_dimension: 'Date' as const,
                dimension: 'Campaign' as const,
                sort: 'ROI%' as const,
                direction: 'desc' as const,
                limit: 10,
                dates: { from: '11/01/2024', to: '11/18/2024' },
            };

            const result = await tool.invoke(input as any);
            const parsed = JSON.parse(result);

            expect(parsed.queryContext).toBeDefined();
            expect(parsed.queryContext.query).toEqual(
                expect.objectContaining({
                    groupBy: ['Date', 'Campaign'],
                    sort: 'ROI%',
                    direction: 'desc',
                    limit: 10,
                })
            );
            expect(parsed.queryContext.responseMetadata).toEqual(
                expect.objectContaining({
                    totalRows: expect.any(Number),
                    filteredRows: expect.any(Number),
                    groupBy: ['Date', 'Campaign'],
                })
            );
        });
    });
});
