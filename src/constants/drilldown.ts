/**
 * Drilldown report constants
 * Extracted from drilldown-tool.ts for reuse and maintainability
 */

/**
 * Valid GroupBy dimensions for drilldown reports
 * Must match columns in Postgres analytics_data table and stored procedures
 */
export const GROUP_BY_DIMENSIONS = [
  'Campaign', 'TrafficSource', 'Offer', 'Affiliate',
  'Country', 'CountryCode', 'CountryName',
  'Device', 'DeviceType',
  'OS', 'Browser',
  'LandingPage', 'Rotation',
  'Date', 'Month', 'Year', 'Hour',
] as const;

export type GroupByDimension = typeof GROUP_BY_DIMENSIONS[number];

/**
 * Valid filter types for drilldown reports
 */
export const FILTER_TYPES = [
  'Campaign', 'TrafficSource', 'Affiliate', 'Offer',
  'LandingPage', 'Rotation',
  'Country', 'CountryCode', 'CountryName',
  'Device', 'DeviceType', 'OS', 'Browser',
] as const;

export type FilterType = typeof FILTER_TYPES[number];

/**
 * Available metrics for conditions and sorting
 */
export const METRIC_NAMES = [
  'Clicks', 'OfferViews', 'OfferClicks',
  'CTR%', 'CVRs', 'CR%',
  'Revenue', 'Spent', 'Profit', 'ROI%',
  'EPC', 'CPC',
] as const;

export type MetricName = typeof METRIC_NAMES[number];

/**
 * Condition comparison operators
 */
export const CONDITION_TYPES = [
  'Is Greater Than',
  'Is Less Than',
  'Is Between',
  'Contains',
  'Does Not Contain',
  'Equal To',
  'Not Equal To',
  'Greater Than or Equal To',
  'Less Than or Equal To',
] as const;

export type ConditionType = typeof CONDITION_TYPES[number];

/**
 * Valid date range presets
 */
export const DATE_RANGE_PRESETS = [
  'today', 'yesterday', 'this_week', 'last_week', 'last_7_days', 'last_30_days',
  'this_month', 'last_month', 'this_year', 'last_year',
] as const;

export type DateRangePresetType = typeof DATE_RANGE_PRESETS[number];

/**
 * Valid timezone names
 */
export const TIMEZONE_NAMES = ['EST5EDT', 'PST8PDT', 'MST7MDT', 'CST6CDT', 'UTC'] as const;

export type TimezoneName = typeof TIMEZONE_NAMES[number];

/**
 * Date basis options
 */
export const DATE_BASIS_OPTIONS = ['created_on', 'conversion_date'] as const;

export type DateBasis = typeof DATE_BASIS_OPTIONS[number];

/**
 * Time granularity dimensions for trend analysis (first dimension)
 */
export const TIME_DIMENSIONS = ['Date', 'Month', 'Year', 'Hour'] as const;

export type TimeDimension = typeof TIME_DIMENSIONS[number];

/**
 * Entity dimensions for trend analysis (second dimension)
 * Uses same dimensions as drilldown - trend is just drilldown with time grouping
 * @deprecated Use GROUP_BY_DIMENSIONS instead - kept for backward compatibility
 */
export const TREND_GROUP_BY_DIMENSIONS = GROUP_BY_DIMENSIONS;

export type TrendGroupByDimension = GroupByDimension;

/**
 * Sort metrics - unified for both drilldown and trend analysis
 * These are the metrics that can be used for sorting results
 * Must match what's available in the backend (DrilldownMetrics type)
 */
export const SORT_METRICS = [
  'Name', 'Clicks', 'Revenue', 'Spent', 'Profit', 'ROI%',
  'CPC', 'EPC', 'CVRs', 'CTR%', 'CR%',
  'OfferClicks', 'OfferViews',
] as const;

export type SortMetric = typeof SORT_METRICS[number];
