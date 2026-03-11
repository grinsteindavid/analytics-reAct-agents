import { TestContext, TestResult } from './types';

export const test = {
  id: 12,
  name: 'Turn Reference (Skip Turn History)',
  question: 'N/A - Multi-turn test with specific turn reference',
};

/**
 * Tests entitySources with "type": "turn" to reference a specific historical turn
 * 
 * Scenario:
 * - Turn 1: "Top 5 campaigns by ROI" → Gets Campaign entities
 * - Turn 2: "Top traffic sources by revenue" → NEW query, gets TrafficSource entities (clears campaigns)
 * - Turn 3: "What was the CPC for those campaigns from turn 1?" → Should reference turn 0
 * 
 * Turn 3 must use entitySources: [{"type": "turn", "index": 0}] because
 * "history" would look at turn 1 which only has TrafficSource entities.
 */
export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  // Helper to get entities from a specific turn in conversationHistory
  const getEntitiesFromTurn = (result: any, turnIndex: number) => {
    return result.conversationHistory?.[turnIndex]?.entities || [];
  };

  try {
    // Turn 1: Get campaigns
    const turn1 = await workflow.execute('Top 5 campaigns by ROI in the last 7 days', { sessionId });
    details.push(`Turn 1 Intent: ${turn1.intent}`);
    // Entities are now in conversationHistory[0].entities (first turn = index 0)
    const turn1Campaigns = getEntitiesFromTurn(turn1, 0).filter((e: any) => e.type === 'Campaign');
    details.push(`Turn 1 Campaigns: ${turn1Campaigns.length}`);

    if (turn1Campaigns.length === 0) {
      return { name: test.name, passed: false, intent: 'error', details: [...details, 'Turn 1 did not return campaigns'] };
    }

    // Turn 2: NEW query about traffic sources (not follow-up)
    const turn2 = await workflow.execute('Top 5 traffic sources by revenue in the last 7 days', { sessionId });
    details.push(`Turn 2 Intent: ${turn2.intent}`);
    // Turn 2 entities are in conversationHistory[1] (second turn = index 1)
    const turn2Entities = getEntitiesFromTurn(turn2, 1);
    const turn2TrafficSources = turn2Entities.filter((e: any) => e.type === 'TrafficSource');
    details.push(`Turn 2 TrafficSources: ${turn2TrafficSources.length}`);
    details.push(`ConversationHistory length: ${turn2.conversationHistory?.length || 0}`);

    // Turn 3: Reference the first campaigns (natural language - user doesn't know "turns")
    const turn3 = await workflow.execute('What about the CPC for those first campaigns we looked at?', { sessionId });
    details.push(`Turn 3 Intent: ${turn3.intent}`);
    // Turn 3 should reference turn 0 campaigns via entitySources
    const turn3Entities = getEntitiesFromTurn(turn3, 2);
    const turn3Campaigns = turn3Entities.filter((e: any) => e.type === 'Campaign');
    details.push(`Turn 3 Campaigns: ${turn3Campaigns.length}`);

    // Check if turn 0 campaigns are still in history (for Planner to reference)
    const historicalTurn0Campaigns = getEntitiesFromTurn(turn3, 0).filter((e: any) => e.type === 'Campaign');
    details.push(`Turn 0 campaigns in history: ${historicalTurn0Campaigns.length}`);

    // Success if: all analytics, turn 3 has campaigns, and history preserved turn 0 campaigns
    const passed =
      turn1.intent === 'analytics' &&
      turn2.intent === 'analytics' &&
      turn3.intent === 'analytics' &&
      historicalTurn0Campaigns.length > 0;

    return { name: test.name, passed, intent: turn3.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [...details, String(error)] };
  }
}
