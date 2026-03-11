/**
 * Collect All Data Utility
 * Unified data collection from multiple sources for Summary Agent
 */
import { CampaignAnalysisState } from '../types/state';
import { logStep } from './debug-logger';

export interface CollectedData {
  rows: any[];
  sources: string[];
}

export interface CollectionDebugInfo {
  accumulatedDataCount: number;
  drilldownDataCount: number;
  entityLookupDataCount: number;
  conversationHistoryCount: number;
  sourcesUsed: string[];
  totalRows: number;
}

/**
 * Collect ALL available data from any source into a unified structure
 * This prevents bugs where one empty source shadows another with data
 */
export function collectAllData(state: CampaignAnalysisState): CollectedData {
  const rows: any[] = [];
  const sources: string[] = [];

  // 1. Check accumulatedData first (from Planner flow)
  // If accumulatedData exists, use it exclusively to avoid duplicates with legacy state fields
  // Note: 'trend' type no longer exists in accumulatedData - trend queries now produce 'drilldown' type
  if (state.accumulatedData?.length) {
    for (const item of state.accumulatedData) {
      if (item.type === 'drilldown' && item.data) {
        // Only drilldown has metrics data - entity_lookup is metadata only
        if (Array.isArray(item.data)) {
          rows.push(...item.data);
        } else {
          rows.push(item.data);
        }
        sources.push(`accumulated:${item.type}`);
      }
      // Skip entity_lookup - it's metadata (entities), not metrics rows
    }
  } else {
    // 2. Fallback to direct state fields ONLY if no accumulatedData (legacy single-tool flows)
    if (state.drilldownData?.length) {
      rows.push(...state.drilldownData);
      sources.push('drilldown');
    }

    if (state.entityLookupData?.length) {
      rows.push(...state.entityLookupData);
      sources.push('entityLookup');
    }
  }

  return { rows, sources };
}

/**
 * Build debug info for logging (without including actual data)
 */
export function buildCollectionDebugInfo(state: CampaignAnalysisState, result: CollectedData): CollectionDebugInfo {
  return {
    accumulatedDataCount: state.accumulatedData?.length || 0,
    drilldownDataCount: state.drilldownData?.length || 0,
    entityLookupDataCount: state.entityLookupData?.length || 0,
    conversationHistoryCount: state.conversationHistory?.length || 0,
    sourcesUsed: result.sources,
    totalRows: result.rows.length,
  };
}

/**
 * Log data collection to debug file (not console)
 */
export function logDataCollection(debugInfo: CollectionDebugInfo): void {
  try {
    logStep('data-collection' as any, {
      input: {
        accumulatedData: debugInfo.accumulatedDataCount,
        drilldownData: debugInfo.drilldownDataCount,
        entityLookupData: debugInfo.entityLookupDataCount,
        conversationHistory: debugInfo.conversationHistoryCount,
      },
      output: {
        sources: debugInfo.sourcesUsed,
        totalRows: debugInfo.totalRows,
      },
    });
  } catch {
    // Logging is non-critical
  }
}
