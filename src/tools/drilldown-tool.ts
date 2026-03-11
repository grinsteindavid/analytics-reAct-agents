/**
 * Drilldown tool - executes analytics drilldown reports via Postgres
 * Single dimension grouping. For time-series analysis, use trend-analysis-tool instead.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { processReport } from '../data-access/postgres/drilldown-query';
import { CacheHelper } from '../data-access/redis/cache-helper';
import { DatabaseContext } from '../types/context';
import { parseDateRange, DateRangePreset } from '../utils/date-range-parser';
import { filterDataMetrics, INTENT_DEFAULT_METRICS } from '../utils/metric-selector';
import { mergeFiltersWithDefaults, DrilldownFilter } from '../utils/drilldown-filters';
import { drilldownToolSchema, DrilldownToolInput } from './drilldown-schema';

/** EST timezone offset in hours */
const EST_OFFSET = 5;
const EST_TIMEZONE = 'EST5EDT';

/** Default row limit */
const DEFAULT_LIMIT = 25;

/**
 * Tool description - minimal, schema handles validation
 */
const TOOL_DESCRIPTION = `Execute a drilldown analytics report with a single dimension.

For TIME-SERIES analysis (day-by-day trends), use the trend_analysis tool instead.

REQUIRED:
- options.group_by: dimension to group by (e.g., "Campaign", "TrafficSource")
- dates: Either dateRange preset OR from/to dates`;

/**
 * Parse dates from input - handles both presets and custom dates
 */
function parseDates(dates: { dateRange?: string; from?: string; to?: string }): { from: string; to: string } {
  if (dates.dateRange) {
    const parsed = parseDateRange(dates.dateRange as DateRangePreset, 'YYYY-MM-DD HH:mm:ss');
    console.log(`📅 Parsed date range "${dates.dateRange}" -> ${parsed.from} to ${parsed.to}`);
    return parsed;
  }

  if (dates.from && dates.to) {
    return { from: dates.from, to: dates.to };
  }

  throw new Error('Must provide either dateRange preset or both from and to dates');
}

/**
 * Build query from validated input
 * group_by is a single string, wrapped in array for backend compatibility
 */
function buildQuery(input: DrilldownToolInput, fromDate: string, toDate: string) {
  const mergedFilters = mergeFiltersWithDefaults((input.filters || []) as DrilldownFilter[]);
  const groupBy = [input.options.group_by]; // Wrap single string in array for backend

  return {
    save: true,
    name: null,
    id: `drilldown_${Date.now()}`,
    filters: mergedFilters,
    options: {
      flatten: true,
      totalize: true,
      group_by: groupBy,
      conditions: (input.options.conditions || []).map((c, idx) => ({ ...c, id: idx })),
      sort: input.options.sort || 'ROI%',
      direction: input.options.direction || 'desc',
      limit: input.options.limit || DEFAULT_LIMIT,
      page: input.options.page || 1,
    },
    dates: {
      based_on: input.dates.based_on || 'created_on',
      from: fromDate,
      to: toDate,
      time_offset: EST_OFFSET,
      moment_name: EST_TIMEZONE,
    },
  };
}

/**
 * Create drilldown tool with database context
 */
export function createDrilldownTool(_context: DatabaseContext) {
  return new DynamicStructuredTool({
    name: 'execute_drilldown_report',
    description: TOOL_DESCRIPTION,
    schema: drilldownToolSchema,
    func: async (input) => {
      try {
        const { from: fromDate, to: toDate } = parseDates(input.dates);
        const query = buildQuery(input as DrilldownToolInput, fromDate, toDate);

        // Log query structure
        console.log(`📋 Drilldown Query:`, JSON.stringify({
          filters: query.filters?.filter((f: any) => f.ids?.length > 0 || f.conditions?.length > 0),
          options: query.options,
          dates: query.dates,
        }, null, 2));

        const cacheParams = {
          filters: query.filters,
          options: query.options,
          dates: query.dates,
        };

        // Execute drilldown via processReport
        const { result } = await CacheHelper.withCache(
          'drilldown',
          cacheParams,
          () => processReport(query as any)
        );
        const rawData = Array.isArray(result) ? result : (result as any).data || [];
        const totalRows = rawData.length;
        console.log(`✅ Drilldown returned ${totalRows} rows`);

        // Filter metrics
        const userMetrics = (input as DrilldownToolInput).metricsSelection;
        const defaultMetrics = INTENT_DEFAULT_METRICS['analytics'] || [];
        const sortMetric = input.options.sort || 'ROI%';
        const baseMetrics = userMetrics?.length ? userMetrics : [...defaultMetrics];
        const metricsToKeep = baseMetrics.includes(sortMetric)
          ? baseMetrics
          : [...baseMetrics, sortMetric];
        const filteredData = filterDataMetrics(rawData, metricsToKeep);
        console.log(`📊 Filtered to ${metricsToKeep.length} metrics: ${metricsToKeep.join(', ')}`);

        // Response groupBy - preserve original format (string or array)
        const responseGroupBy = input.options.group_by;

        const queryContext = {
          query: {
            filters: (query.filters || []).filter((f: any) => f.ids?.length > 0),
            groupBy: responseGroupBy,
            sort: query.options.sort,
            direction: query.options.direction,
            limit: query.options.limit,
            dateRange: { from: fromDate, to: toDate },
            conditions: query.options.conditions || [],
          },
          responseMetadata: {
            totalRows,
            filteredRows: filteredData.length,
            groupBy: responseGroupBy,
            metricsIncluded: metricsToKeep,
            metricsRequested: userMetrics || null,
          },
        };

        // Extract entity IDs for follow-up queries
        const entityIds = filteredData
          .filter((row: any) => row.ID && row.ID !== 'Total')
          .map((row: any) => row.ID);

        // Primary dimension is the single group_by value
        const primaryDimension = input.options.group_by;

        return JSON.stringify({
          success: true,
          data: filteredData,
          totalRows,
          groupBy: responseGroupBy,
          queryContext,
          ...(primaryDimension === 'Campaign' && { campaignIds: entityIds }),
          ...(primaryDimension === 'TrafficSource' && { trafficSourceIds: entityIds }),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: errorMessage,
        });
      }
    },
  });
}
