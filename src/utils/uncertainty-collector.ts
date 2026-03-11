/**
 * Uncertainty Collector Utility
 * Collects reasons for low confidence in summary results
 */
import { CampaignAnalysisState } from '../types/state';
import { SummaryOutput } from '../agents/summary-agent';
import { collectAllData } from './collect-all-data';

/**
 * Collect reasons for low confidence
 */
export function collectUncertaintyReasons(
  state: CampaignAnalysisState,
  summary: SummaryOutput,
  dataIncomplete: boolean
): string[] {
  const reasons: string[] = [];

  // Check intent confidence
  if (state.intentConfidence !== undefined && state.intentConfidence < 0.8) {
    reasons.push(state.intentAmbiguityReason || 'Ambiguous question intent');
  }

  // Check evaluator confidence
  if (state.evaluationResult?.confidence !== undefined && state.evaluationResult.confidence < 0.7) {
    reasons.push('Evaluator uncertain about data sufficiency');
  }

  // Check data completeness
  if (dataIncomplete) {
    reasons.push('Data truncated due to size limits');
  }

  // Check for no data
  const allData = collectAllData(state);
  if (allData.rows.length === 0) {
    reasons.push('No data returned from queries');
  }

  // Include LLM-provided uncertainty reasons
  if (summary.uncertaintyReasons?.length) {
    reasons.push(...summary.uncertaintyReasons);
  }

  return reasons;
}
