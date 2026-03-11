/**
 * Confidence Calculator Utility
 * Calculates overall confidence from multiple sources
 */
import { CampaignAnalysisState } from '../types/state';
import { SummaryOutput } from '../agents/summary-agent';
import { collectAllData } from './collect-all-data';

export interface ConfidenceFactors {
  intentConfidence?: number;
  evaluatorConfidence?: number;
  dataCompleteness?: number;
  llmConfidence?: number;
  dataAvailability?: number;
}

/**
 * Calculate overall confidence from multiple sources
 * Aggregates intent confidence, evaluator confidence, and data quality signals
 * 
 * Caps confidence at 0.6 when no entity data exists - we can explain "no data"
 * correctly but can't provide meaningful analytics without data.
 */
export function calculateOverallConfidence(
  state: CampaignAnalysisState,
  summary: SummaryOutput,
  dataIncomplete: boolean
): number {
  const factors = collectConfidenceFactors(state, summary, dataIncomplete);
  const avgConfidence = computeAverageConfidence(factors);

  // Cap at 0.6 when no entity data exists
  if (factors.dataAvailability === 0.5) {
    return Math.min(avgConfidence, 0.6);
  }

  return avgConfidence;
}

/**
 * Collect individual confidence factors from various sources
 */
export function collectConfidenceFactors(
  state: CampaignAnalysisState,
  summary: SummaryOutput,
  dataIncomplete: boolean
): ConfidenceFactors {
  const factors: ConfidenceFactors = {};

  // Factor 1: Intent classification confidence
  if (state.intentConfidence !== undefined) {
    factors.intentConfidence = state.intentConfidence;
  }

  // Factor 2: Evaluator confidence (if available)
  if (state.evaluationResult?.confidence !== undefined) {
    factors.evaluatorConfidence = state.evaluationResult.confidence;
  }

  // Factor 3: Data completeness (penalize truncated data)
  if (dataIncomplete) {
    factors.dataCompleteness = 0.7;
  }

  // Factor 4: LLM-provided confidence from summary (if available)
  if (summary.confidence !== undefined) {
    factors.llmConfidence = summary.confidence;
  }

  // Factor 5: Data availability (exclude Total rows - they're aggregate metadata, not entity data)
  const allData = collectAllData(state);
  const entityRows = allData.rows.filter(row => row?.Name !== 'Total');
  const hasEntityData = entityRows.length > 0;
  if (!hasEntityData) {
    factors.dataAvailability = 0.5;
  }

  return factors;
}

/**
 * Compute weighted average of confidence factors
 */
export function computeAverageConfidence(factors: ConfidenceFactors): number {
  const values = Object.values(factors).filter((v): v is number => v !== undefined);

  if (values.length === 0) {
    return 0.85; // Default confidence
  }

  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}
