import { ChatOpenAI } from '@langchain/openai';
import { CampaignAnalysisState } from '../types/state';
import { EntityReference, EntityType, extractEntitiesFromDocuments } from '../types/entity';
import { createCampaignLookupTool } from '../tools/campaign-lookup-tool';
import { createTrafficSourceLookupTool } from '../tools/traffic-source-lookup-tool';
import { createGenericEntityLookupTool } from '../tools/generic-entity-lookup-tool';
import { DatabaseContext } from '../types/context';
import { logEntityLookupResponse } from '../utils/debug-logger';

const SYSTEM_PROMPT = `You are an entity lookup agent. Parse the instruction and call the appropriate tool.
Tools describe their own parameters.

If entityFilters are provided, use them to filter results via the ids parameter.`;

/**
 * Entity Lookup Agent
 * Unified agent for looking up entity metadata from MongoDB
 * Uses split tools: lookup_campaigns, lookup_traffic_sources, and lookup_generic_entity
 */
export class EntityLookupAgent {
  private llm: ChatOpenAI;
  private campaignTool: ReturnType<typeof createCampaignLookupTool>;
  private trafficSourceTool: ReturnType<typeof createTrafficSourceLookupTool>;
  private genericTool: ReturnType<typeof createGenericEntityLookupTool>;

  constructor(context: DatabaseContext, modelName: string = 'gpt-4o-mini') {
    this.llm = new ChatOpenAI({ modelName, temperature: 0 });
    this.campaignTool = createCampaignLookupTool(context);
    this.trafficSourceTool = createTrafficSourceLookupTool(context);
    this.genericTool = createGenericEntityLookupTool(context);
  }

  async lookup(state: CampaignAnalysisState): Promise<Partial<CampaignAnalysisState>> {
    try {
      // Bind tools so LLM can see their schemas and descriptions
      const tools = [this.campaignTool, this.trafficSourceTool, this.genericTool];
      const llmWithTools = this.llm.bindTools(tools);

      // Build input following DrilldownAgent pattern - pass entities as filters
      const entityFilters = this.entitiesToFilters(state.entities || []);

      const input = {
        question: state.question,
        entityFilters: entityFilters.length > 0 ? entityFilters : undefined,
      };

      // LLM picks tool based on instruction - tools describe themselves
      const response = await llmWithTools.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ]);

      // Extract tool call from response
      const toolCall = response.tool_calls?.[0];
      if (!toolCall) {
        throw new Error('No tool selected by LLM');
      }

      // Execute the selected tool
      let toolResult: string;
      let entityType: EntityType;

      const args = toolCall.args;

      switch (toolCall.name) {
        case 'lookup_traffic_sources':
          toolResult = await this.trafficSourceTool.invoke(args);
          entityType = 'TrafficSource';
          break;
        case 'lookup_campaigns':
          toolResult = await this.campaignTool.invoke(args);
          entityType = 'Campaign';
          break;
        case 'lookup_generic_entity':
          toolResult = await this.genericTool.invoke(args as { entityType: string });
          entityType = args.entityType as EntityType;
          break;
        default:
          throw new Error(`Unknown tool: ${toolCall.name}`);
      }

      const parsedResult = JSON.parse(toolResult);

      if (!parsedResult.success) {
        console.error('❌ Entity lookup failed:', parsedResult.error);
        // Log failed lookup for debugging
        logEntityLookupResponse(
          toolCall.name,
          entityType,
          toolCall.args,
          [],
          [],
          { ...input, error: parsedResult.error }
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

      // Extract entities from results
      // NOTE: No merge with state.entities - execute-plan handles entity resolution via entitySources
      const extractedEntities = extractEntitiesFromDocuments(
        parsedResult.data || [],
        entityType
      );

      // Debug logging
      logEntityLookupResponse(
        toolCall.name,
        entityType,
        toolCall.args,
        parsedResult.data,
        extractedEntities,
        input  // LLM input for debugging
      );

      return {
        // Return extracted entities directly - execute-plan stores in accumulatedData
        entities: extractedEntities,
        entityLookupData: parsedResult.data,
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls + 1,
        },
      };
    } catch (error) {
      console.error('❌ Entity lookup error:', error);
      // Log error for debugging
      logEntityLookupResponse(
        'unknown',
        'Unknown' as any,
        {},
        [],
        [],
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      return {
        error: error instanceof Error ? error.message : 'Entity lookup failed',
        metadata: {
          ...state.metadata,
          llmCalls: state.metadata.llmCalls + 1,
          toolCalls: state.metadata.toolCalls + 1,
        },
      };
    }
  }

  /**
   * Convert entities to filter format (same as DrilldownAgent)
   */
  private entitiesToFilters(entities: EntityReference[]): Array<{ type: string; ids: string[] }> {
    const grouped: Record<string, string[]> = {};
    for (const e of entities) {
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type]!.push(e.id);
    }
    return Object.entries(grouped).map(([type, ids]) => ({ type, ids }));
  }
}

