/**
 * Zod schema for drilldown tool input validation
 * Schema enforces valid values - prompts don't need to list enums
 */
import { z } from 'zod';
import {
  GROUP_BY_DIMENSIONS,
  FILTER_TYPES,
  METRIC_NAMES,
  CONDITION_TYPES,
  DATE_RANGE_PRESETS,
  DATE_BASIS_OPTIONS,
  SORT_METRICS,
} from '../constants/drilldown';

/**
 * Condition schema - used in both filters and options
 */
const conditionSchema = z.object({
  metric: z.enum(METRIC_NAMES as unknown as [string, ...string[]]).describe(
    'Performance metric to evaluate'
  ),
  type: z.enum(CONDITION_TYPES as unknown as [string, ...string[]]).describe(
    'Comparison operator for the condition'
  ),
  value: z.number().describe(
    'Threshold value. For ROI%, CR%, CTR%, OfferCR%: use decimal (25% = 0.25, 5% = 0.05). For other metrics: use raw number.'
  ),
});

/**
 * Filter schema - for narrowing down data
 */
const filterSchema = z.object({
  type: z.enum(FILTER_TYPES as unknown as [string, ...string[]]).describe(
    'Filter type - determines which entity or condition to filter by'
  ),
  ids: z.array(z.string()).nullable().default(null).describe(
    'Array of entity IDs (MongoDB ObjectIds) or TrafficType values'
  ),
  conditions: z.array(conditionSchema).nullable().default(null).describe(
    'Metric-based filtering conditions'
  ),
});

/**
 * Options schema - report configuration
 * Single dimension grouping only
 * For time-series analysis, use the trend-analysis tool instead
 */
const optionsSchema = z.object({
  group_by: z.enum(GROUP_BY_DIMENSIONS as unknown as [string, ...string[]]).describe(
    'Dimension to group by (e.g., "Campaign", "TrafficSource")'
  ),
  conditions: z.array(conditionSchema).nullable().default([]).describe(
    'Global conditions applied to all results after grouping'
  ),
  sort: z.enum(SORT_METRICS as unknown as [string, ...string[]]).nullable().default('ROI%').describe(
    'Metric to sort results by (default: ROI%)'
  ),
  direction: z.enum(['asc', 'desc']).nullable().default('desc').describe(
    'Sort direction: "desc" for best/top, "asc" for worst/bottom'
  ),
  limit: z.number().min(1).max(31).nullable().default(25).describe(
    'Maximum rows to return (default: 25, max: 31) - prevents token overload'
  ),
  page: z.number().min(1).nullable().default(1).describe(
    'Page number for pagination (default: 1)'
  ),
});

/**
 * Dates schema - date range configuration
 * Enforces: either dateRange preset OR both from and to
 */
const datesSchema = z.object({
  based_on: z.enum(DATE_BASIS_OPTIONS as unknown as [string, ...string[]]).nullable().default('created_on').describe(
    'Date field to filter by: "created_on" = click timestamp, "conversion_date" = conversion timestamp'
  ),
  dateRange: z.enum(DATE_RANGE_PRESETS as unknown as [string, ...string[]]).nullable().default(null).describe(
    'Preset date range - automatically parsed to from/to dates'
  ),
  from: z.string().nullable().default(null).describe(
    'Start date (use dateRange preset when possible)'
  ),
  to: z.string().nullable().default(null).describe(
    'End date (use dateRange preset when possible)'
  ),
}).refine(
  (data) => data.dateRange || (data.from && data.to),
  { message: 'Must provide either dateRange preset OR both from and to dates' }
);

/**
 * Complete drilldown tool input schema
 */
export const drilldownToolSchema = z.object({
  filters: z.array(filterSchema).nullable().default([]).describe(
    'Array of filters to narrow down the data set'
  ),
  options: optionsSchema.describe('Report configuration options'),
  dates: datesSchema.describe('Date range and timezone configuration'),
  metricsSelection: z.array(z.string()).nullable().default(null).describe(
    'Specific metrics requested by user (e.g., ["CPC", "ROI%"]). If not provided, uses intent defaults.'
  ),
});

export type DrilldownToolInput = z.infer<typeof drilldownToolSchema>;
