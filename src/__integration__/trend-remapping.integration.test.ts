import { Pool } from 'pg';
import { connectPostgres } from '../data-access/postgres/connection';
import { multiDimensionDrilldown } from '../data-access/postgres/drilldown-query';

const PG_URL = 'postgresql://postgres:postgres@localhost:5432/analytics';

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function baseQuery(groupBy: string[]) {
  return {
    save: true,
    name: null,
    filters: [],
    options: {
      group_by: groupBy,
      conditions: [],
      sort: 'Profit',
      direction: 'desc',
      limit: 10,
      page: 1,
    },
    dates: {
      based_on: 'created_on',
      from: thirtyDaysAgoStr(),
      to: todayStr(),
      time_offset: 5,
      moment_name: 'EST5EDT',
    },
  };
}

/**
 * Simulates the trend tool's remapping logic (from trend-analysis-tool-redshift.ts)
 */
function remapDimensions(
  rows: any[],
  timeDimension: string,
  entityDimension: string,
): any[] {
  return rows.map((row: any) => {
    const { dimension1, dimension2, ...metrics } = row;
    return { [timeDimension]: dimension1, [entityDimension]: dimension2, ...metrics };
  });
}

/**
 * Simulates filterByEntityLimit from the trend tool
 */
function filterByEntityLimit(
  data: any[],
  timeDimension: string,
  limit: number,
  sortMetric: string,
  direction: string,
): any[] {
  const byTimePeriod = new Map<string, any[]>();
  for (const row of data) {
    const timePeriod = row[timeDimension] || '';
    const existing = byTimePeriod.get(timePeriod) || [];
    existing.push(row);
    byTimePeriod.set(timePeriod, existing);
  }

  const result: any[] = [];
  for (const [, rows] of byTimePeriod) {
    rows.sort((a: any, b: any) => {
      const av = Number(a[sortMetric]) || 0;
      const bv = Number(b[sortMetric]) || 0;
      return direction === 'asc' ? av - bv : bv - av;
    });
    result.push(...rows.slice(0, limit));
  }
  return result;
}

describe('Integration: Trend Tool Column Remapping', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = connectPostgres(PG_URL);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should remap dimension1/dimension2 to named columns', async () => {
    const query = baseQuery(['Date', 'Campaign']);
    const rawRows = await multiDimensionDrilldown(query as any);
    expect(rawRows.length).toBeGreaterThan(0);

    // Raw rows have dimension1/dimension2
    const rawFirst = rawRows[0] as any;
    expect(rawFirst).toHaveProperty('dimension1');
    expect(rawFirst).toHaveProperty('dimension2');
    expect(rawFirst).not.toHaveProperty('Date');
    expect(rawFirst).not.toHaveProperty('Campaign');

    // After remapping
    const remapped = remapDimensions(rawRows, 'Date', 'Campaign');
    const remappedFirst = remapped[0];
    expect(remappedFirst).toHaveProperty('Date');
    expect(remappedFirst).toHaveProperty('Campaign');
    expect(remappedFirst).not.toHaveProperty('dimension1');
    expect(remappedFirst).not.toHaveProperty('dimension2');
    expect(remappedFirst).toHaveProperty('Clicks');
  });

  it('should correctly partition by time period after remapping', async () => {
    const query = baseQuery(['Date', 'Campaign']);
    const rawRows = await multiDimensionDrilldown(query as any);
    const remapped = remapDimensions(rawRows, 'Date', 'Campaign');

    const filtered = filterByEntityLimit(remapped, 'Date', 3, 'Profit', 'desc');

    // Count unique dates
    const dates = new Set(filtered.map((r: any) => r.Date));
    expect(dates.size).toBeGreaterThan(0);

    // Each date should have at most 3 entities
    for (const date of dates) {
      const rowsForDate = filtered.filter((r: any) => r.Date === date);
      expect(rowsForDate.length).toBeLessThanOrEqual(3);
    }
  });

  it('should preserve all metric columns after remapping', async () => {
    const expectedMetrics = [
      'Clicks', 'Revenue', 'Spent', 'Profit', 'ROI%',
      'CPC', 'EPC', 'CVRs', 'CR%', 'CTR%',
      'OfferClicks', 'OfferViews',
    ];

    const query = baseQuery(['Month', 'TrafficSource']);
    const rawRows = await multiDimensionDrilldown(query as any);
    const remapped = remapDimensions(rawRows, 'Month', 'TrafficSource');

    expect(remapped.length).toBeGreaterThan(0);
    const first = remapped[0];
    expect(first).toHaveProperty('Month');
    expect(first).toHaveProperty('TrafficSource');
    expectedMetrics.forEach((key) => {
      expect(first).toHaveProperty(key);
    });
  });
});
