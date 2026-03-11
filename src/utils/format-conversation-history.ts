import { ConversationTurn } from '../types/state';
import { EntityReference } from '../types/entity';

// Threshold below which confidence is considered low
const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Format timestamp as relative time (e.g., "2 min ago", "1 hour ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) > 1 ? 's' : ''} ago`;
}

/**
 * Format entities as counts by type (token-efficient)
 * Planner uses entitySources for actual IDs, not conversation history
 */
function formatEntityCounts(entities: EntityReference[]): string {
  if (!entities || entities.length === 0) return '';

  const typeCounts = entities.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const countStr = Object.entries(typeCounts)
    .map(([type, count]) => `${count} ${type}(s)`)
    .join(', ');

  return `\nEntities: [${countStr}]`;
}

/**
 * Format conversation history for LLM context
 * 
 * Design principles:
 * - Full summary always (never truncated) - Planner needs complete context
 * - Entity counts only (not names/IDs) - Planner uses entitySources for actual IDs
 * - Always show confidence - helps Planner assess reliability of prior turns
 * 
 * Format:
 * Turn {idx} ({relativeTime}) [{confidence}%]:
 * User: {question}
 * Assistant: {full summary}
 * Entities: [{count} {type}(s), ...]
 */
export function formatConversationHistory(
  history: ConversationTurn[] | undefined
): string {
  if (!history || history.length === 0) return '';

  return history
    .map((turn, idx) => {
      const timePart = turn.timestamp ? ` (${formatRelativeTime(turn.timestamp)})` : '';

      // Always show confidence - helps Planner assess reliability
      let confidencePart = '';
      if (turn.confidence !== undefined) {
        const pct = (turn.confidence * 100).toFixed(0);
        if (turn.confidence < LOW_CONFIDENCE_THRESHOLD && turn.uncertaintyReasons?.length) {
          confidencePart = ` [${pct}% - ${turn.uncertaintyReasons[0]}]`;
        } else {
          confidencePart = ` [${pct}%]`;
        }
      }

      const headerLine = `Turn ${idx}${timePart}${confidencePart}:`;
      const questionLine = `User: ${turn.question}`;
      const summaryLine = `Assistant: ${turn.summary || ''}`;
      const entityLine = formatEntityCounts(turn.entities || []);
      const dateRangeLine = turn.dateRange
        ? `\nDateRange: ${turn.dateRange.from} to ${turn.dateRange.to}`
        : '';

      return `${headerLine}\n${questionLine}\n${summaryLine}${entityLine}${dateRangeLine}`;
    })
    .join('\n\n');
}
