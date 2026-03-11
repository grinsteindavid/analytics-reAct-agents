import {
  extractEntitiesFromData,
  extractEntitiesFromDocuments,
  mergeEntities,
  entitiesToFilters,
  groupByToEntityType,
} from '../entity';

describe('extractEntitiesFromData', () => {
  it('should extract entities from ID/Name columns', () => {
    const data = [
      { ID: '001', Name: 'Campaign A', Revenue: 100 },
      { ID: '002', Name: 'Campaign B', Revenue: 200 },
    ];
    const result = extractEntitiesFromData(data, 'Campaign');
    expect(result).toEqual([
      { type: 'Campaign', id: '001', name: 'Campaign A' },
      { type: 'Campaign', id: '002', name: 'Campaign B' },
    ]);
  });

  it('should deduplicate repeated entities (trend data scenario)', () => {
    const data = [
      { ID: '001', Name: 'Camp A', Date: '2026-03-01' },
      { ID: '002', Name: 'Camp B', Date: '2026-03-01' },
      { ID: '001', Name: 'Camp A', Date: '2026-03-02' },
      { ID: '002', Name: 'Camp B', Date: '2026-03-02' },
      { ID: '001', Name: 'Camp A', Date: '2026-03-03' },
      { ID: '002', Name: 'Camp B', Date: '2026-03-03' },
    ];
    const result = extractEntitiesFromData(data, 'Campaign');
    expect(result).toHaveLength(2);
    expect(result).toEqual([
      { type: 'Campaign', id: '001', name: 'Camp A' },
      { type: 'Campaign', id: '002', name: 'Camp B' },
    ]);
  });

  it('should handle dimension-specific columns without ID column', () => {
    const data = [
      { Country: 'US', Revenue: 500 },
      { Country: 'UK', Revenue: 300 },
      { Country: 'US', Revenue: 400 },
    ];
    const result = extractEntitiesFromData(data, 'Country');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: 'Country', id: 'US', name: 'US' });
    expect(result[1]).toEqual({ type: 'Country', id: 'UK', name: 'UK' });
  });

  it('should skip Total rows', () => {
    const data = [
      { ID: '001', Name: 'Camp A', Revenue: 100 },
      { ID: 'Total', Name: 'Total', Revenue: 100 },
    ];
    const result = extractEntitiesFromData(data, 'Campaign');
    expect(result).toHaveLength(1);
  });

  it('should return empty array for unknown groupBy', () => {
    const data = [{ ID: '001', Name: 'X' }];
    const result = extractEntitiesFromData(data, 'UnknownDimension');
    expect(result).toEqual([]);
  });

  it('should return empty array for empty data', () => {
    const result = extractEntitiesFromData([], 'Campaign');
    expect(result).toEqual([]);
  });
});

describe('extractEntitiesFromDocuments', () => {
  it('should extract entities with all attributes', () => {
    const docs = [
      { _id: 'abc123', name: 'Google Ads', status: 'active', api: { name: 'GOOGLE' } },
    ];
    const result = extractEntitiesFromDocuments(docs, 'TrafficSource');
    expect(result).toHaveLength(1);
    const entity = result[0]!;
    expect(entity.type).toBe('TrafficSource');
    expect(entity.id).toBe('abc123');
    expect(entity.name).toBe('Google Ads');
    expect(entity.status).toBe('active');
  });
});

describe('mergeEntities', () => {
  it('should deduplicate by type+id', () => {
    const a = [{ type: 'Campaign' as const, id: '1', name: 'A' }];
    const b = [
      { type: 'Campaign' as const, id: '1', name: 'A' },
      { type: 'Campaign' as const, id: '2', name: 'B' },
    ];
    const result = mergeEntities(a, b);
    expect(result).toHaveLength(2);
  });
});

describe('entitiesToFilters', () => {
  it('should group entities by type', () => {
    const entities = [
      { type: 'Campaign' as const, id: '1' },
      { type: 'Campaign' as const, id: '2' },
      { type: 'TrafficSource' as const, id: 'ts1' },
    ];
    const filters = entitiesToFilters(entities);
    expect(filters).toHaveLength(2);
    expect(filters.find(f => f.type === 'Campaign')?.ids).toEqual(['1', '2']);
    expect(filters.find(f => f.type === 'TrafficSource')?.ids).toEqual(['ts1']);
  });
});

describe('groupByToEntityType', () => {
  it('should map known dimensions', () => {
    expect(groupByToEntityType('Campaign')).toBe('Campaign');
    expect(groupByToEntityType('TrafficSource')).toBe('TrafficSource');
    expect(groupByToEntityType('CountryCode')).toBe('Country');
    expect(groupByToEntityType('DeviceType')).toBe('Device');
  });

  it('should return null for unknown dimensions', () => {
    expect(groupByToEntityType('Date')).toBeNull();
    expect(groupByToEntityType('Month')).toBeNull();
  });
});
