/**
 * Metric Selector Utility
 * Filters response data to include only selected metrics for token budget
 */

/**
 * Default metrics included in all summaries
 */
export const DEFAULT_METRICS = [
  'Revenue', 'Spent', 'Profit', 'ROI%',
  'Clicks', 'CVRs', 'CR%',
] as const;

/**
 * Intent-specific default metrics when metricsSelection not provided
 * v3 simplified intents: analytics, metadata_only, non_analytics
 */
export const INTENT_DEFAULT_METRICS: Record<string, readonly string[]> = {
  // analytics: handles drilldown, trend, follow-up, entity lookups with metrics
  analytics: ['Revenue', 'Spent', 'Profit', 'ROI%', 'Clicks', 'CVRs', 'CR%', 'CPC'],
  // metadata_only: pure entity listing without metrics (MongoDB only)
  metadata_only: [],
  // non_analytics: system capabilities, off-topic, explanations (no data)
  non_analytics: [],
};

/**
 * Identity fields always preserved (not metrics)
 * These are non-negotiable - summary agent needs them to understand relationships
 */
export const IDENTITY_FIELDS = ['Name', 'ID', 'Date', 'Campaign', 'TrafficSource', 'Offer', 'Affiliate', 'Country', 'Device'];

/**
 * Entity metadata fields preserved for metadata_only intent
 * These are MongoDB document fields needed for entity status queries
 */
export const ENTITY_METADATA_FIELDS = ['type', 'id', 'name', 'status', 'trafficSource', 'created_on', 'updated_on'];

/**
 * Minimum metrics always included for summary agent context
 * Even if user only asks for CPC, we include these so agent can understand performance
 */
export const MINIMUM_METRICS = ['Revenue', 'Spent', 'Profit', 'ROI%'] as const;

/**
 * Get metrics to include based on intent and user selection
 * ALWAYS includes MINIMUM_METRICS for summary agent context
 * 
 * @param intent - The classified intent
 * @param metricsSelection - User-requested metrics (optional)
 * @returns Array of metrics to include (minimum + user-requested + intent defaults)
 */
export function getMetricsForIntent(
  intent: string,
  metricsSelection?: string[]
): string[] {
  // Start with minimum metrics (non-negotiable for summary agent)
  const metrics = new Set<string>([...MINIMUM_METRICS]);

  // Add user-specified metrics if provided
  if (metricsSelection && metricsSelection.length > 0) {
    metricsSelection.forEach(m => metrics.add(m));
  } else {
    // Fall back to intent defaults
    const intentDefaults = INTENT_DEFAULT_METRICS[intent] || DEFAULT_METRICS;
    intentDefaults.forEach(m => metrics.add(m));
  }
  
  return [...metrics];
}

/**
 * Filter data rows to include only selected metrics
 * ALWAYS preserves:
 * - Identity fields (Name, ID, Date, etc.) - for entity identification
 * - Minimum metrics (Revenue, Spent, Profit, ROI%) - for summary agent context
 */
export function filterDataMetrics(
  data: Record<string, any>[],
  metricsToKeep: string[]
): Record<string, any>[] {
  // Always include identity fields + minimum metrics + user-requested metrics
  const fieldsToKeep = new Set([...IDENTITY_FIELDS, ...MINIMUM_METRICS, ...metricsToKeep]);
  
  return data.map(row => {
    const filtered: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(row)) {
      if (fieldsToKeep.has(key)) {
        filtered[key] = value;
      }
    }
    
    return filtered;
  });
}

