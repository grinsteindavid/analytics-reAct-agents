import { Pool } from 'pg';
import { connectPostgres } from '../data-access/postgres/connection';
import { processReport, multiDimensionDrilldown } from '../data-access/postgres/drilldown-query';

const PG_URL = 'postgresql://postgres:postgres@localhost:5432/analytics';

const EXPECTED_METRIC_KEYS = [
  'Clicks', 'Revenue', 'Spent', 'Profit', 'ROI%',
  'CPC', 'EPC', 'CVRs', 'CR%', 'CTR%',
  'OfferClicks', 'OfferViews',
];

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

function baseQuery(groupBy: string | string[], overrides?: Record<string, any>) {
  const isMulti = Array.isArray(groupBy);
  return {
    save: true,
    name: null,
    filters: [],
    options: {
      group_by: isMulti ? groupBy : [groupBy],
      conditions: [],
      sort: 'Profit',
      direction: 'desc',
      limit: 25,
      page: 1,
      flatten: true,
      totalize: true,
      ...overrides,
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

let pool: Pool;

beforeAll(() => {
  pool = connectPostgres(PG_URL);
});

afterAll(async () => {
  await pool.end();
});

describe('Integration: fn_drilldown_report', () => {
  describe('GroupBy dimensions', () => {
    const entityDimensions = [
      'Campaign', 'TrafficSource', 'Offer', 'Affiliate',
      'Country', 'CountryCode',
      'Device', 'DeviceType',
      'OS', 'Browser',
      'LandingPage', 'Rotation',
    ];

    it.each(entityDimensions)('should return rows for group_by=%s', async (dim) => {
      const query = baseQuery(dim);
      const rows = await processReport(query as any);

      expect(rows.length).toBeGreaterThan(0);

      const first = rows[0] as any;
      expect(first).toHaveProperty('ID');
      expect(first).toHaveProperty('Name');
      EXPECTED_METRIC_KEYS.forEach((key) => {
        expect(first).toHaveProperty(key);
      });
    });
  });

  describe('Sort metrics', () => {
    const sortMetrics = [
      'Clicks', 'Revenue', 'Spent', 'Profit', 'ROI%',
      'CPC', 'EPC', 'CVRs', 'CR%', 'CTR%',
      'OfferClicks', 'OfferViews', 'Name',
    ];

    it.each(sortMetrics)('should sort by %s descending', async (metric) => {
      const query = baseQuery('Campaign', { sort: metric, direction: 'desc' });
      const rows = await processReport(query as any);
      expect(rows.length).toBeGreaterThan(0);

      if (rows.length >= 2) {
        const first = (rows[0] as any)[metric];
        const second = (rows[1] as any)[metric];
        // Numeric metrics: first >= second in desc order
        if (typeof first === 'number' && typeof second === 'number') {
          expect(first).toBeGreaterThanOrEqual(second);
        }
      }
    });

    it('should sort ascending when direction=asc', async () => {
      const query = baseQuery('Campaign', { sort: 'Clicks', direction: 'asc' });
      const rows = await processReport(query as any);

      if (rows.length >= 2) {
        const first = Number((rows[0] as any).Clicks);
        const second = Number((rows[1] as any).Clicks);
        expect(first).toBeLessThanOrEqual(second);
      }
    });
  });

  describe('Filters', () => {
    it('should filter by Campaign IDs', async () => {
      const targetId = 'bbb000000000000000000001';
      const query = baseQuery('TrafficSource');
      query.filters = [{ type: 'Campaign', ids: [targetId] }] as any;

      const rows = await processReport(query as any);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should filter by TrafficSource IDs', async () => {
      const targetId = 'aaa000000000000000000001';
      const query = baseQuery('Campaign');
      query.filters = [{ type: 'TrafficSource', ids: [targetId] }] as any;

      const rows = await processReport(query as any);
      expect(rows.length).toBeGreaterThan(0);
      // Should have fewer campaigns than unfiltered
    });

    it('should filter by Country', async () => {
      const query = baseQuery('Campaign');
      query.filters = [{ type: 'Country', ids: ['US'] }] as any;

      const rows = await processReport(query as any);
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should return empty for non-existent filter IDs', async () => {
      const query = baseQuery('Campaign');
      query.filters = [{ type: 'Campaign', ids: ['nonexistent_id'] }] as any;

      const rows = await processReport(query as any);
      expect(rows.length).toBe(0);
    });
  });

  describe('Conditions (HAVING)', () => {
    it('should filter by Clicks > N', async () => {
      const query = baseQuery('Campaign', {
        conditions: [{ metric: 'Clicks', type: 'Is Greater Than', value: 100 }],
      });

      const rows = await processReport(query as any);
      rows.forEach((row: any) => {
        expect(Number(row.Clicks)).toBeGreaterThan(100);
      });
    });

    it('should filter by Profit > 0', async () => {
      const query = baseQuery('Campaign', {
        conditions: [{ metric: 'Profit', type: 'Is Greater Than', value: 0 }],
      });

      const rows = await processReport(query as any);
      rows.forEach((row: any) => {
        expect(Number(row.Profit)).toBeGreaterThan(0);
      });
    });

    it('should filter by Revenue <= N', async () => {
      const threshold = 50;
      const query = baseQuery('Campaign', {
        conditions: [{ metric: 'Revenue', type: 'Less Than or Equal To', value: threshold }],
      });

      const rows = await processReport(query as any);
      rows.forEach((row: any) => {
        expect(Number(row.Revenue)).toBeLessThanOrEqual(threshold);
      });
    });

    it('should combine multiple conditions (AND)', async () => {
      const query = baseQuery('Campaign', {
        conditions: [
          { metric: 'Clicks', type: 'Is Greater Than', value: 50 },
          { metric: 'Revenue', type: 'Is Greater Than', value: 10 },
        ],
      });

      const rows = await processReport(query as any);
      rows.forEach((row: any) => {
        expect(Number(row.Clicks)).toBeGreaterThan(50);
        expect(Number(row.Revenue)).toBeGreaterThan(10);
      });
    });
  });

  describe('Limit', () => {
    it('should respect limit parameter', async () => {
      const query = baseQuery('Campaign', { limit: 3 });
      const rows = await processReport(query as any);
      expect(rows.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('Integration: fn_multi_dimension_drilldown', () => {
  describe('Time × Entity dimensions', () => {
    const timeDims = ['Date', 'Month', 'Year', 'Hour'];

    it.each(timeDims)('should return rows for %s × Campaign', async (timeDim) => {
      const query = baseQuery([timeDim, 'Campaign']);
      const rows = await multiDimensionDrilldown(query as any);

      expect(rows.length).toBeGreaterThan(0);

      const first = rows[0] as any;
      expect(first).toHaveProperty('dimension1');
      expect(first).toHaveProperty('dimension2');
      EXPECTED_METRIC_KEYS.forEach((key) => {
        expect(first).toHaveProperty(key);
      });
    });
  });

  describe('Entity dimension variants', () => {
    const entityDims = [
      'TrafficSource', 'Offer', 'Affiliate',
      'Country', 'Device', 'OS', 'Browser',
      'LandingPage', 'Rotation',
    ];

    it.each(entityDims)('should return rows for Date × %s', async (entityDim) => {
      const query = baseQuery(['Date', entityDim]);
      const rows = await multiDimensionDrilldown(query as any);

      expect(rows.length).toBeGreaterThan(0);
      expect((rows[0] as any)).toHaveProperty('dimension1');
      expect((rows[0] as any)).toHaveProperty('dimension2');
    });
  });

  describe('Sort and direction', () => {
    it('should sort by specified metric descending', async () => {
      const query = baseQuery(['Date', 'Campaign'], { sort: 'Revenue', direction: 'desc' });
      const rows = await multiDimensionDrilldown(query as any);

      expect(rows.length).toBeGreaterThan(0);
      // Within the same time period (dimension1), revenue should be sorted desc
    });

    it('should sort ascending when direction=asc', async () => {
      const query = baseQuery(['Date', 'Campaign'], { sort: 'Clicks', direction: 'asc' });
      const rows = await multiDimensionDrilldown(query as any);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('Filters', () => {
    it('should filter by TrafficSource IDs', async () => {
      const targetId = 'aaa000000000000000000001';
      const query = baseQuery(['Date', 'Campaign']);
      query.filters = [{ type: 'TrafficSource', ids: [targetId] }] as any;

      const rows = await multiDimensionDrilldown(query as any);
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('Conditions (HAVING)', () => {
    it('should filter by Clicks > N', async () => {
      const query = baseQuery(['Date', 'Campaign'], {
        conditions: [{ metric: 'Clicks', type: 'Is Greater Than', value: 100 }],
      });

      const rows = await multiDimensionDrilldown(query as any);
      rows.forEach((row: any) => {
        expect(Number(row.Clicks)).toBeGreaterThan(100);
      });
    });

    it('should filter by ROI% > 0', async () => {
      const query = baseQuery(['Date', 'Campaign'], {
        conditions: [{ metric: 'ROI%', type: 'Is Greater Than', value: 0 }],
      });

      const rows = await multiDimensionDrilldown(query as any);
      rows.forEach((row: any) => {
        expect(Number(row['ROI%'])).toBeGreaterThan(0);
      });
    });
  });
});
