import { TestContext, TestResult } from './types';

export const test = {
  id: 11,
  name: 'Entity Lookup (Rotations) + Landing Page Drilldown',
  question: 'Show me rotations with status on and their landing page performance by ROI for the last 7 days',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 100)}...`);
    details.push(`LLM Calls: ${result.metadata?.llmCalls}`);
    details.push(`Tool Calls: ${result.metadata?.toolCalls}`);

    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);

    // Get entities from conversation history
    const lastTurn = result.conversationHistory?.[result.conversationHistory.length - 1];
    if (lastTurn?.entities?.length) {
      const entityTypes = Array.from(new Set(lastTurn.entities.map(e => e.type)));
      details.push(`Entity types: ${entityTypes.join(', ')}`);
      details.push(`Total entities: ${lastTurn.entities.length}`);
    }

    // Should be analytics with:
    // 1. Entity lookup for rotations (generic entity)
    // 2. Drilldown by LandingPage filtered by rotation IDs
    const hasEntityLookup = (result.metadata?.toolCalls || 0) >= 2;
    
    const passed =
      result.intent === 'analytics' &&
      !!result.result?.summary &&
      hasEntityLookup;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
