import { CampaignAnalysisState } from '../../../types/state';
import { SummaryAgent } from '../../../agents/summary-agent';

/**
 * Generate Summary Node
 * Delegates to SummaryAgent for AI-powered summary generation
 * 
 * Clears transient data (accumulatedData) after summary to prevent
 * it from being persisted in checkpointer.
 */
export async function generateSummary(
  state: CampaignAnalysisState,
  summaryAgent: SummaryAgent
): Promise<Partial<CampaignAnalysisState>> {
  const result = await summaryAgent.generateSummary(state);

  // Clear transient data - should NOT be persisted in checkpointer
  return {
    ...result,
    accumulatedData: undefined,
    drilldownData: undefined,
    entityLookupData: undefined,
  };
}
