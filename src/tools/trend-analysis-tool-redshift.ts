/**
 * Trend Analysis Tool - time-series analytics via Postgres
 * Always uses two dimensions: [time_dimension, entity_dimension]
 * First dimension is always a time dimension (Date, Month, Year, Hour)
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  multiDimensionDrilldown,
} from '../data-access/postgres/drilldown-query';
import { CacheHelper } from '../data-access/redis/cache-helper';
import { DatabaseContext } from '../types/context';
import { parseDateRange, DateRangePreset } from '../utils/date-range-parser';
import { filterDataMetrics, INTENT_DEFAULT_METRICS } from '../utils/metric-selector';
import { mergeFiltersWithDefaults, DrilldownFilter } from '../utils/drilldown-filters';
import {
  GROUP_BY_DIMENSIONS,
  FILTER_TYPES,
  METRIC_NAMES,
  CONDITION_TYPES,
  DATE_RANGE_PRESETS,
  DATE_BASIS_OPTIONS,
  SORT_METRICS,
} from '../constants/drilldown';

/** EST timezone defaults */
const EST_OFFSET = 5;
const EST_TIMEZONE = 'EST5EDT';

/** Default entity limit per time period */
const DEFAULT_ENTITY_LIMIT = 25;

/** Time dimensions for trend analysis */
const TIME_DIMENSIONS = ['Date', 'Month', 'Year', 'Hour'] as const;

const TOOL_DESCRIPTION = `Execute trend analysis with time-series data.

TWO-LEVEL GROUPING (always):
- time_dimension: Time granularity (Date, Month, Year, Hour) - ALWAYS FIRST
- dimension: Entity to track (Campaign, TrafficSource, etc.) - SECOND

Returns JSON data with metrics per time period per entity.
Local filtering limits entities per time period (default: 25).

REQUIRED:
- time_dimension: Time granularity for grouping
- dimension: Entity to track
- dates: Either dateRange preset OR from/to dates`;

/** Condition schema */
const conditionSchema = z.object({
  metric: z.enum(METRIC_NAMES as unknown as [string, ...string[]]),
  type: z.enum(CONDITION_TYPES as unknown as [string, ...string[]]),
  value: z.number(),
});

/** Filter schema */
const filterSchema = z.object({
  type: z.enum(FILTER_TYPES as unknown as [string, ...string[]]),
  ids: z.array(z.string()).nullable().default(null),
  conditions: z.array(conditionSchema).nullable().default(null),
});

/** Trend analysis tool schema */
export const trendAnalysisRedshiftSchema = z.object({
  time_dimension: z.enum(TIME_DIMENSIONS).describe(
    'Time granularity: Date (daily), Month, Year, or Hour'
  ),
  dimension: z.enum(GROUP_BY_DIMENSIONS as unknown as [string, ...string[]]).describe(
    'Entity dimension to analyze (Campaign, TrafficSource, etc.)'
  ),
  filters: z.array(filterSchema).nullable().default([]),
  conditions: z.array(conditionSchema).nullable().default([]),
  sort: z.enum(SORT_METRICS as unknown as [string, ...string[]]).nullable().default('ROI%'),
  direction: z.enum(['asc', 'desc']).nullable().default('desc'),
  limit: z.number().min(1).max(31).nullable().default(25).describe(
    'Max entities per time period (default: 25)'
  ),
  dates: z.object({
    based_on: z.enum(DATE_BASIS_OPTIONS as unknown as [string, ...string[]]).nullable().default('created_on'),
    dateRange: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).nullable().default(null),
    from: z.string().nullable().default(null),
    to: z.string().nullable().default(null),
  }).refine(
    (data) => data.dateRange || (data.from && data.to),
    { message: 'Must provide either dateRange preset OR both from and to dates' }
  ),
  metricsSelection: z.array(z.string()).nullable().default(null),
});

export type TrendAnalysisRedshiftInput = z.infer<typeof trendAnalysisRedshiftSchema>;

/** Parse dates from input */
function parseDates(dates: { dateRange?: string | null; from?: string | null; to?: string | null }): { from: string; to: string } {
  if (dates.dateRange) {
    const parsed = parseDateRange(dates.dateRange as DateRangePreset, 'MM/DD/YYYY');
    console.log(`📅 Parsed date range "${dates.dateRange}" -> ${parsed.from} to ${parsed.to}`);
    return parsed;
  }
  if (dates.from && dates.to) {
    return { from: dates.from, to: dates.to };
  }
  throw new Error('Must provide either dateRange or both from/to dates');
}

/** Build query for multiDimensionDrilldown */
function buildQuery(input: TrendAnalysisRedshiftInput, fromDate: string, toDate: string) {
  const mergedFilters = mergeFiltersWithDefaults((input.filters || []) as DrilldownFilter[]);

  // Ensure Date filter exists for proper grouping
  if (!mergedFilters.some(f => f.type === 'Date')) {
    mergedFilters.push({ type: 'Date', ids: [], conditions: [] });
  }

  // Always [time_dimension, entity_dimension]
  const groupBy = [input.time_dimension, input.dimension];

  return {
    save: false,
    name: null,
    id: `trend_${Date.now()}`,
    filters: mergedFilters,
    options: {
      flatten: true,
      totalize: true,
      group_by: groupBy,
      conditions: (input.conditions || []).map((c, idx) => ({ ...c, id: idx })),
      sort: input.sort || 'ROI%',
      direction: input.direction || 'desc',
      limit: input.limit || DEFAULT_ENTITY_LIMIT,
      page: 1,
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

/** Filter to keep only top N entities per time period */
function filterByEntityLimit(
  data: any[],
  timeDimension: string,
  entityLimit: number,
  sortMetric: string,
  sortDirection: 'asc' | 'desc'
): any[] {
  const byTimePeriod = new Map<string, any[]>();
  for (const row of data) {
    const timePeriod = row[timeDimension] || '';
    const existing = byTimePeriod.get(timePeriod) || [];
    existing.push(row);
    byTimePeriod.set(timePeriod, existing);
  }

  const filteredRows: any[] = [];
  for (const [, rows] of byTimePeriod) {
    rows.sort((a, b) => {
      const aVal = parseFloat(a[sortMetric] || 0);
      const bVal = parseFloat(b[sortMetric] || 0);
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    filteredRows.push(...rows.slice(0, entityLimit));
  }

  return filteredRows;
}

/**
 * Create trend analysis tool with database context
 */
export function createTrendAnalysisRedshiftTool(_context: DatabaseContext) {
  return new DynamicStructuredTool({
    name: 'execute_trend_analysis',
    description: TOOL_DESCRIPTION,
    schema: trendAnalysisRedshiftSchema,
    func: async (input) => {
      try {
        const { from: fromDate, to: toDate } = parseDates(input.dates);
        const query = buildQuery(input as TrendAnalysisRedshiftInput, fromDate, toDate);
        const timeDimension = input.time_dimension;
        const groupBy = [timeDimension, input.dimension];

        console.log('📋 Trend Analysis Query:', JSON.stringify({
          filters: query.filters?.filter((f: any) => f.ids?.length > 0 || f.conditions?.length > 0),
          options: query.options,
          dates: query.dates,
        }, null, 2));

        const cacheParams = {
          filters: query.filters,
          options: query.options,
          dates: query.dates,
        };

        // Use multiDimensionDrilldown via Postgres
        const { result } = await CacheHelper.withCache(
          'trend_analysis',
          cacheParams,
          async () => {
            const flatData = await multiDimensionDrilldown(query as any);
            return flatData;
          }
        );

        // Remap dimension1/dimension2 → named dimension columns
        // SP returns generic column names; tools expect row[timeDimension] and row[dimension]
        let rawData = result.map((row: any) => {
          const { dimension1, dimension2, ...metrics } = row;
          return { [timeDimension]: dimension1, [input.dimension]: dimension2, ...metrics };
        });
        const totalRows = rawData.length;
        console.log(`✅ Trend analysis returned ${totalRows} rows`);

        // Local filtering: limit entities per time period
        const entityLimit = input.limit || DEFAULT_ENTITY_LIMIT;
        rawData = filterByEntityLimit(
          rawData,
          timeDimension,
          entityLimit,
          input.sort || 'ROI%',
          input.direction || 'desc'
        );
        console.log(`📊 Filtered to top ${entityLimit} entities per time period: ${rawData.length} rows`);

        // Filter metrics
        const userMetrics = input.metricsSelection;
        const defaultMetrics = INTENT_DEFAULT_METRICS['analytics'] || [];
        const sortMetric = input.sort || 'ROI%';
        const baseMetrics = userMetrics?.length ? userMetrics : [...defaultMetrics];
        const metricsToKeep = baseMetrics.includes(sortMetric)
          ? baseMetrics
          : [...baseMetrics, sortMetric];
        const filteredData = filterDataMetrics(rawData, metricsToKeep);
        console.log(`📊 Filtered to ${metricsToKeep.length} metrics: ${metricsToKeep.join(', ')}`);

        const queryContext = {
          query: {
            filters: (query.filters || []).filter((f: any) => f.ids?.length > 0),
            groupBy,
            sort: query.options.sort,
            direction: query.options.direction,
            limit: entityLimit,
            dateRange: { from: fromDate, to: toDate },
          },
          responseMetadata: {
            totalRows,
            filteredRows: filteredData.length,
            groupBy,
            metricsIncluded: metricsToKeep,
            metricsRequested: userMetrics || null,
          },
        };

        return JSON.stringify({
          success: true,
          data: filteredData,
          totalRows: filteredData.length,
          groupBy,
          dateRange: { from: fromDate, to: toDate },
          queryContext,
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
