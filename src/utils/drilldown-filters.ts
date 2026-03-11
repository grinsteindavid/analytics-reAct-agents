/**
 * Default filters and filter merging logic for drilldown reports
 */

/**
 * Default filters applied to all drilldown queries
 * Only entity filter types that map to Postgres columns
 * Stored procedure _build_filter_clauses() handles these
 */
export const DEFAULT_FILTERS = [
  { type: 'Campaign', ids: [], conditions: [] },
  { type: 'TrafficSource', ids: [] },
  { type: 'Affiliate', ids: [] },
  { type: 'Offer', ids: [], conditions: [] },
  { type: 'Rotation', ids: [], conditions: [] },
] as const;

export type DrilldownFilter = {
  type: string;
  ids?: string[];
  conditions?: Array<{ metric: string; type: string; value?: unknown }>;
};

/**
 * Merge user-provided filters with defaults
 * User filters override defaults for the same filter type
 */
export function mergeFiltersWithDefaults(userFilters: DrilldownFilter[]): DrilldownFilter[] {
  const defaults = JSON.parse(JSON.stringify(DEFAULT_FILTERS)) as DrilldownFilter[];
  const merged = [...defaults];

  userFilters.forEach((userFilter) => {
    const index = merged.findIndex((f) => f.type === userFilter.type);
    if (index !== -1) {
      merged[index] = userFilter;
    } else {
      merged.push(userFilter);
    }
  });

  return merged;
}
