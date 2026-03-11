import { getPool } from './connection';

export interface DrilldownRow {
  ID: string;
  Name: string;
  Clicks: number;
  Revenue: number;
  Spent: number;
  Profit: number;
  'ROI%': number;
  CPC: number;
  EPC: number;
  CVRs: number;
  'CR%': number;
  'CTR%': number;
  OfferClicks: number;
  OfferViews: number;
  children?: DrilldownRow[];
}

/**
 * Execute a single-dimension drilldown report via Postgres function
 * Execute analytics drilldown report via Postgres stored function
 */
export async function processReport(query: Record<string, any>): Promise<DrilldownRow[]> {
  const pool = getPool();
  const result = await pool.query<DrilldownRow>(
    'SELECT * FROM fn_drilldown_report($1::jsonb)',
    [JSON.stringify(query)]
  );
  return result.rows;
}

/**
 * Execute a multi-dimension drilldown (trend analysis) via Postgres function
 * Replaces multiDimensionDrilldown + flattenDrilldownResults
 * Returns flat rows with dimension columns + metrics
 */
export async function multiDimensionDrilldown(
  query: Record<string, any>
): Promise<Record<string, any>[]> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM fn_multi_dimension_drilldown($1::jsonb)',
    [JSON.stringify(query)]
  );
  return result.rows;
}

/**
 * Flatten nested drilldown results to a flat array
 * Preserved for backward compatibility with existing tool code
 */
export function flattenDrilldownResults(
  data: DrilldownRow[],
  groupByColumns: string[],
  currentLevel: number = 0,
  parentValues: Record<string, string> = {}
): Record<string, any>[] {
  const results: Record<string, any>[] = [];

  for (const row of data) {
    if (row.Name === 'Total') continue;

    const currentGroupBy = groupByColumns[currentLevel];
    const rowValues = {
      ...parentValues,
      [currentGroupBy!]: row.Name,
    };

    if (row.children && row.children.length > 0) {
      results.push(
        ...flattenDrilldownResults(row.children, groupByColumns, currentLevel + 1, rowValues)
      );
    } else {
      const { children, ...metrics } = row;
      results.push({
        ...rowValues,
        ...metrics,
      });
    }
  }

  return results;
}
