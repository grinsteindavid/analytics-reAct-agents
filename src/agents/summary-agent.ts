import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { CampaignAnalysisState, formatConversationHistory } from '../types/state';
import { buildSummaryPrompt } from '../prompts/summary-generator';
import { logSummaryGeneration, logSummaryInput } from '../utils/debug-logger';
import { getMetricsForIntent, filterDataMetrics } from '../utils/metric-selector';
import { collectAllData } from '../utils/collect-all-data';
import { calculateOverallConfidence } from '../utils/confidence-calculator';
import { collectUncertaintyReasons } from '../utils/uncertainty-collector';
import {
  GROUP_BY_DIMENSIONS,
  METRIC_NAMES,
  DATE_RANGE_PRESETS,
  TIME_DIMENSIONS,
  TREND_GROUP_BY_DIMENSIONS,
} from '../constants/drilldown';

/**
 * Summary Agent Output
 */
export interface SummaryOutput {
  summary: string;
  keyInsights: string[] | null;
  confidence?: number;  // 0-1 scale - overall response confidence
  uncertaintyReasons?: string[];  // Why confidence is low
  dataIncomplete?: boolean;
}

/**
 * Accumulated data from multiple tool calls
 */
export interface AccumulatedData {
  type: 'drilldown' | 'trend' | 'entity_lookup';
  instruction: string;
  reason: string;
  data: any;
  query?: any;
  timestamp: number;
}

/**
 * Summary Agent
 * Generates AI-powered summaries and insights from analytics results
 * Supports accumulative context and multi-tool orchestration
 */
const SummaryResponseSchema = z.object({
  summary: z.string().describe('2-3 sentence answer to the question'),
  keyInsights: z.array(z.string()).nullable().describe('Key insights with actual entity names'),
  dataIncomplete: z.boolean().describe('True if data was truncated or incomplete'),
});

export class SummaryAgent {
  private llmWithStructuredOutput: any;
  private systemPrompt: string;

  constructor(modelName: string = 'gpt-4o-mini') {
    const llm = new ChatOpenAI({ 
      modelName, 
      temperature: 0.3,
    });
    this.llmWithStructuredOutput = llm.withStructuredOutput(SummaryResponseSchema);

    // Build prompt with injected system capabilities from constants
    this.systemPrompt = buildSummaryPrompt({
      dimensions: [...GROUP_BY_DIMENSIONS],
      metrics: [...METRIC_NAMES],
      dateRanges: [...DATE_RANGE_PRESETS],
      timeDimensions: [...TIME_DIMENSIONS],
      trendDimensions: [...TREND_GROUP_BY_DIMENSIONS],
    });
  }

  /**
   * Generate summary and insights from results
   * Limits data to 100 rows to avoid token limits
   */
  async generateSummary(state: CampaignAnalysisState): Promise<Partial<CampaignAnalysisState>> {
    console.log('🔍 Generating summary...');
    const startTime = Date.now();
    
    try {
      
      // Determine which data to summarize
      let data: any;
      let totalRows: number;
      let truncatedData: any;
      let dataIncomplete: boolean;
      
      // Get metrics to include based on intent and user selection
      const metricsSelection = (state.entities as any)?.metricsSelection;
      const metricsToKeep = getMetricsForIntent(state.intent || 'analytics', metricsSelection);

      if (metricsSelection) {
        console.log(`📊 Using user-specified metrics: ${metricsToKeep.join(', ')}`);
      } else {
        console.log(`📊 Using default metrics for ${state.intent}: ${metricsToKeep.join(', ')}`);
      }

      // === UNIFIED DATA COLLECTION ===
      // Collect ALL available data from any source into a single structure
      // This prevents bugs where one empty source shadows another with data
      const allData = collectAllData(state);

      // Use unified data (drilldown, entity lookups, or accumulated)
      data = allData.rows;
      totalRows = data.length;

      // For metadata_only intent, preserve all entity fields (status, trafficSource, etc.)
      // For analytics intent, filter to selected metrics
      const filteredData = state.intent === 'metadata_only'
        ? data // Keep all entity metadata fields
        : filterDataMetrics(data, metricsToKeep);
      truncatedData = filteredData.slice(0, 200);
      dataIncomplete = totalRows > 200;

      if (dataIncomplete) {
        console.log(`⚠️  Data truncated: ${totalRows} rows → 200 rows for summary`);
      }

      // Log what data sources were used
      if (allData.sources.length > 0) {
        console.log(`📊 Data sources: ${allData.sources.join(', ')} (${totalRows} rows)`);
      }
      
      // Prepare input for LLM - accumulatedData has all agent responses
      const input = {
        question: state.question,
        intent: state.intent,
        chatHistory: formatConversationHistory(state.conversationHistory) || null,
        // Strip 'entities' array - only needed by planner/execute-plan, not summary
        accumulatedData: (state.accumulatedData || []).map(item => {
          const { entities: _entities, ...rest } = item;
          return rest;
        }),
      };

      // Log full LLM input for debugging
      try {
        logSummaryInput(input);
      } catch {
        // Logging is non-critical, continue if it fails
      }
      
      const summary = await this.llmWithStructuredOutput.invoke([
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ]);
      
      const duration = Date.now() - startTime;
      console.log(`✅ Summary generated (${duration}ms)`);
      
      // Calculate overall confidence from multiple sources
      const overallConfidence = calculateOverallConfidence(state, summary, dataIncomplete);
      const uncertaintyReasons = collectUncertaintyReasons(state, summary, dataIncomplete);

      // Build result with multi-tool orchestration support
      const result: CampaignAnalysisState['result'] = {
        summary: summary.summary,
        keyInsights: summary.keyInsights,
        confidence: overallConfidence,
        uncertaintyReasons: uncertaintyReasons.length > 0 ? uncertaintyReasons : undefined,
        dataIncomplete: summary.dataIncomplete || dataIncomplete,
        totalRows,
      };

      // Log confidence for observability
      if (overallConfidence < 0.7) {
        console.log(`⚠️  Low overall confidence: ${overallConfidence.toFixed(2)}`);
        uncertaintyReasons.forEach(r => console.log(`   - ${r}`));
      }

      // Log summary generation for debugging
      logSummaryGeneration(
        summary.summary,
        summary.keyInsights,
        overallConfidence,
        uncertaintyReasons,
        summary.dataIncomplete || dataIncomplete
      );

      // Build partial state update with transient data
      const stateUpdate: Partial<CampaignAnalysisState> = { result };

      // Add intent-specific transient data (not persisted in checkpointer)
      if (state.intent === 'analytics') {
        if (truncatedData) {
          stateUpdate.drilldownData = truncatedData;
        }
      } else if (state.intent === 'metadata_only') {
        stateUpdate.entityLookupData = truncatedData;
      }

      return {
        ...stateUpdate,
        metadata: {
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls,
          startTime: state.metadata.startTime,
          endTime: state.metadata.endTime,
          timings: [
            ...(state.metadata.timings || []),
            { step: 'generate_summary', type: 'llm' as const, duration, timestamp: startTime },
          ],
        },
      };
    } catch (error) {
      console.error('❌ Summary generation error:', error);
      
      // Log error for debugging
      logSummaryGeneration(
        'Summary generation failed',
        [],
        0,
        [error instanceof Error ? error.message : 'Unknown error'],
        true
      );

      // Fallback: use direct state data for error recovery (simple fallback)
      const fallbackData = state.drilldownData || state.entityLookupData || [];
      return {
        result: {
          summary: 'Summary generation failed. Showing raw data.',
          keyInsights: [],
          totalRows: fallbackData.length,
        },
        drilldownData: fallbackData.slice(0, 200),
        error: error instanceof Error ? error.message : 'Summary generation failed',
        metadata: {
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls,
          startTime: state.metadata.startTime,
          endTime: state.metadata.endTime,
          timings: state.metadata.timings,
        },
      };
    }
  }
}
