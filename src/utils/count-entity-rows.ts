/**
 * Count entity rows in data, excluding the "Total" aggregate row.
 * 
 * - If data has only "Total" row → 0 (no actual entities)
 * - If data has 1 actual entity → 1 (even if small, it's real data)
 */
export function countEntityRows(data: unknown): number | 'present' | 'empty' {
  if (!data) return 'empty';

  if (Array.isArray(data)) {
    // Filter out the "Total" aggregate row - it's metadata, not entity data
    const entityRows = data.filter(row => {
      if (typeof row !== 'object' || row === null) return true;
      const name = (row as Record<string, unknown>).Name;
      return name !== 'Total';
    });
    return entityRows.length;
  }

  // Object or other truthy value
  return 'present';
}
