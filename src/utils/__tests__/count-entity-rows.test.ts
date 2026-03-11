import { countEntityRows } from '../count-entity-rows';

describe('countEntityRows', () => {
  it('should return "empty" for null/undefined', () => {
    expect(countEntityRows(null)).toBe('empty');
    expect(countEntityRows(undefined)).toBe('empty');
  });

  it('should exclude Total row from count', () => {
    const data = [
      { Name: 'Total', Revenue: 1000 },
      { Name: 'Campaign A', Revenue: 500 },
      { Name: 'Campaign B', Revenue: 500 },
    ];
    expect(countEntityRows(data)).toBe(2);
  });

  it('should return 0 for data with only Total row', () => {
    const data = [{ Name: 'Total', Revenue: 1000 }];
    expect(countEntityRows(data)).toBe(0);
  });

  it('should return 1 for single entity row (not Total)', () => {
    const data = [{ Name: 'My Offer', Revenue: 500 }];
    expect(countEntityRows(data)).toBe(1);
  });

  it('should count all rows when no Total row exists', () => {
    const data = [
      { Name: 'Offer A', Revenue: 300 },
      { Name: 'Offer B', Revenue: 400 },
      { Name: 'Offer C', Revenue: 300 },
    ];
    expect(countEntityRows(data)).toBe(3);
  });

  it('should handle empty array', () => {
    expect(countEntityRows([])).toBe(0);
  });

  it('should return "present" for non-array objects', () => {
    expect(countEntityRows({ some: 'object' })).toBe('present');
  });

  it('should return "present" for string data', () => {
    // Strings are no longer parsed as CSV - just return present
    expect(countEntityRows('some string')).toBe('present');
  });
});
