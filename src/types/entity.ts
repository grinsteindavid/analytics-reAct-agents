/**
 * Unified Entity Reference Model
 * Single source of truth for all entity IDs across the workflow
 * Replaces scattered campaignIds, trafficSourceIds, etc.
 */

/**
 * Supported entity types that can be referenced in the workflow
 */
export type EntityType =
  | 'Campaign'
  | 'TrafficSource'
  | 'Offer'
  | 'Affiliate'
  | 'Device'
  | 'Browser'
  | 'OS'
  | 'Country'
  | 'LandingPage'
  | 'Rotation';

/**
 * Reference to an entity with type, ID, name (minimum) + any dynamic attributes
 * Used throughout the workflow for consistent entity tracking
 * Supports dynamic attributes from MongoDB (status, created_on, etc.)
 */
export interface EntityReference {
  type: EntityType;
  id: string;
  name?: string;
  [key: string]: any; // Dynamic attributes from MongoDB
}

/**
 * Map groupBy dimension names to EntityType
 */
const GROUP_BY_TO_ENTITY_TYPE: Record<string, EntityType> = {
  Campaign: 'Campaign',
  TrafficSource: 'TrafficSource',
  Offer: 'Offer',
  Affiliate: 'Affiliate',
  Device: 'Device',
  DeviceType: 'Device',
  Browser: 'Browser',
  OS: 'OS',
  Country: 'Country',
  CountryCode: 'Country',
  CountryName: 'Country',
  LandingPage: 'LandingPage',
  Rotation: 'Rotation',
};

/**
 * Convert groupBy dimension to EntityType
 */
export function groupByToEntityType(groupBy: string): EntityType | null {
  return GROUP_BY_TO_ENTITY_TYPE[groupBy] || null;
}

/**
 * Extract EntityReference[] from drilldown/trend data (single dimension)
 * Handles both:
 * - Generic ID/Name columns (MongoDB style)
 * - Dimension-specific columns like Campaign, TrafficSource (Redshift style)
 */
export function extractEntitiesFromData(
  data: any[],
  groupBy: string
): EntityReference[] {
  const entityType = groupByToEntityType(groupBy);
  if (!entityType) return [];

  const seen = new Set<string>();
  return data
    .filter((row) => {
      // Check for generic ID column OR dimension-specific column (e.g., Campaign)
      const id = row.ID || row[groupBy];
      return id && id !== 'Total';
    })
    .reduce<EntityReference[]>((acc, row) => {
      // Prefer ID/Name columns, fall back to dimension column
      const id = String(row.ID || row[groupBy]);
      const key = `${entityType}:${id}`;
      if (seen.has(key)) return acc;
      seen.add(key);
      const name = row.Name || (row.ID ? undefined : row[groupBy]);
      acc.push({
        type: entityType,
        id,
        name: name ? String(name) : undefined,
      });
      return acc;
    }, []);
}


/**
 * Extract EntityReference[] from MongoDB documents
 * Preserves all attributes from the document, with type/id/name as minimum
 */
export function extractEntitiesFromDocuments(
  documents: any[],
  entityType: EntityType
): EntityReference[] {
  return documents.map((doc) => {
    // Extract id and name first (required fields)
    const id = doc._id?.toString() || doc.id;
    const name = doc.name || doc.Name || undefined;

    // Copy all other attributes from the document
    const { _id, name: _docName, Name: _docNameAlt, ...rest } = doc;

    return {
      type: entityType,
      id,
      name,
      ...rest, // Spread all other attributes (status, created_on, etc.)
    };
  });
}

/**
 * Merge entity arrays, deduplicating by type+id
 */
export function mergeEntities(
  existing: EntityReference[],
  newEntities: EntityReference[]
): EntityReference[] {
  const seen = new Set<string>();
  const result: EntityReference[] = [];

  for (const entity of [...existing, ...newEntities]) {
    const key = `${entity.type}:${entity.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entity);
    }
  }

  return result;
}

/**
 * Filter entities by type
 */
export function filterEntitiesByType(
  entities: EntityReference[],
  type: EntityType
): EntityReference[] {
  return entities.filter((e) => e.type === type);
}

/**
 * Get IDs from entities of a specific type
 */
export function getEntityIds(
  entities: EntityReference[],
  type: EntityType
): string[] {
  return filterEntitiesByType(entities, type).map((e) => e.id);
}

/**
 * Generic filter structure for drilldown/trend queries
 * Replaces specific campaignIds/trafficSourceIds with unified format
 */
export interface EntityFilter {
  type: string;  // Filter type (Campaign, TrafficSource, Offer, etc.)
  ids: string[]; // Array of entity IDs
}

/**
 * Convert EntityReference[] to generic filters for drilldown/trend queries
 * Groups entities by type and returns array of filters
 */
export function entitiesToFilters(entities: EntityReference[]): EntityFilter[] {
  const byType = new Map<string, string[]>();

  for (const entity of entities) {
    const ids = byType.get(entity.type) || [];
    ids.push(entity.id);
    byType.set(entity.type, ids);
  }

  const filters: EntityFilter[] = [];
  for (const [type, ids] of byType) {
    filters.push({ type, ids });
  }

  return filters;
}

/**
 * Format entities for LLM context (concise representation)
 */
export function formatEntitiesForContext(
  entities: EntityReference[],
  maxPerType: number = 10
): string {
  const byType = new Map<EntityType, EntityReference[]>();

  for (const entity of entities) {
    const list = byType.get(entity.type) || [];
    list.push(entity);
    byType.set(entity.type, list);
  }

  const parts: string[] = [];
  for (const [type, list] of byType) {
    const limited = list.slice(0, maxPerType);
    const ids = limited.map((e) => e.name || e.id).join(', ');
    const suffix = list.length > maxPerType ? ` (+${list.length - maxPerType} more)` : '';
    parts.push(`${type}: [${ids}]${suffix}`);
  }

  return parts.join('\n');
}

