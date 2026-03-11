import { ChatOpenAI } from '@langchain/openai';
import { DRILLDOWN_AGENT_PROMPT } from '../prompts/drilldown-agent-prompt';
import { TREND_ANALYSIS_AGENT_PROMPT } from '../prompts/trend-analysis-agent-prompt';
import { CampaignAnalysisState } from '../types/state';
import { extractEntitiesFromData, entitiesToFilters } from '../types/entity';
import { createDrilldownTool } from '../tools/drilldown-tool';
import { createTrendAnalysisRedshiftTool } from '../tools/trend-analysis-tool-redshift';
import { DatabaseContext } from '../types/context';
import { logDrilldownResponse } from '../utils/debug-logger';

export type DrilldownStepType = 'drilldown' | 'trend';

/**
 * Drilldown Agent
 * Handles both drilldown and trend queries via two specialized tools
 * - drilldown: single dimension analytics
 * - trend: time-series with [time_dimension, entity_dimension]
 */
export class DrilldownAgent {
  private llm: ChatOpenAI;
  private drilldownTool: ReturnType<typeof createDrilldownTool>;
  private trendTool: ReturnType<typeof createTrendAnalysisRedshiftTool>;

  constructor(context: DatabaseContext, modelName: string = 'gpt-4o-mini') {
    this.llm = new ChatOpenAI({
      modelName,
      temperature: 0,
    });
    this.drilldownTool = createDrilldownTool(context);
    this.trendTool = createTrendAnalysisRedshiftTool(context);
  }

  async execute(state: CampaignAnalysisState, stepType: DrilldownStepType = 'drilldown'): Promise<Partial<CampaignAnalysisState>> {
    try {
      const entityFilters = entitiesToFilters(state.entities || []);

      const input = {
        question: state.question,
        entityFilters: entityFilters.length > 0 ? entityFilters : undefined,
        currentDateTime: state.currentDateTime,
      };

      // Select prompt and tool based on step type
      const prompt = stepType === 'trend' ? TREND_ANALYSIS_AGENT_PROMPT : DRILLDOWN_AGENT_PROMPT;
      const tool = stepType === 'trend' ? this.trendTool : this.drilldownTool;
      const logPrefix = stepType === 'trend' ? '📈 Trend' : '🔍 Drilldown';

      // Build query using LLM
      const queryResponse = await this.llm.invoke([
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(input) },
      ]);

      const queryContent = queryResponse.content as string;
      const query = JSON.parse(queryContent);

      if (process.env.DEBUG === 'true') {
        console.log(`📥 ${logPrefix} Input entityFilters:`, JSON.stringify(entityFilters, null, 2));
        console.log(`${logPrefix} Query:`, JSON.stringify(query, null, 2));
      }

      // Execute appropriate tool
      const toolResult = await tool.invoke(query);
      const parsedResult = JSON.parse(toolResult);

      if (!parsedResult.success) {
        // Log failed drilldown for debugging
        logDrilldownResponse(
          query.options?.group_by?.[0],
          query,
          [],  // Empty data on failure
          null,
          { ...input, error: parsedResult.error }  // Include error in LLM input log
        );
        return {
          error: parsedResult.error,
          metadata: {
            ...state.metadata,
            llmCalls: state.metadata.llmCalls + 1,
            toolCalls: state.metadata.toolCalls + 1,
          },
        };
      }

      // Extract entities from drilldown results
      // NOTE: No merge with state.entities - execute-plan handles entity resolution via entitySources
      const extractedEntities = extractEntitiesFromData(
        parsedResult.data || [],
        parsedResult.groupBy
      );

      // Debug logging (writes to debug-logs session folder)
      logDrilldownResponse(
        parsedResult.groupBy || query.options?.group_by,
        query,
        parsedResult.data,
        parsedResult.queryContext?.responseMetadata?.metricsRequested,
        input  // LLM input for debugging
      );

      // NOTE: queryContext removed from state - entities stored in accumulatedData per step
      // execute-plan.ts extracts entities and stores them in accumulatedData[i].entities

      // For trends, groupBy is ['Date', 'Campaign'] - entity dimension is second element
      // For drilldowns, groupBy is a single string
      const groupBy = parsedResult.groupBy;
      const entityDimension = Array.isArray(groupBy)
        ? (groupBy.length > 1 ? groupBy[1] : groupBy[0])  // Trends: [time, entity] → entity
        : groupBy;  // Drilldowns: single string

      return {
        drilldownData: parsedResult.data,
        // Return extracted entities - execute-plan will store in accumulatedData
        entities: extractedEntities,
        // Return dateRange for follow-up date inheritance
        dateRange: parsedResult.queryContext?.query?.dateRange,
        // Keep extractedParams for dimension info
        extractedParams: {
          ...state.extractedParams,
          dimension: entityDimension,
        },
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls + 1,
        },
      };
    } catch (error) {
      console.error('❌ Drilldown agent error:', error);
      
      // Enhanced error logging
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        if ('output' in error) {
          console.error('Invalid tool input:', (error as any).output);
        }
      }

      // Log error for debugging (query may not exist if LLM failed)
      logDrilldownResponse(
        'Unknown',
        null,  // Query might not exist
        [],
        null,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      
      return {
        error: error instanceof Error ? error.message : 'Drilldown execution failed',
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls + 1,
        },
      };
    }
  }
}
