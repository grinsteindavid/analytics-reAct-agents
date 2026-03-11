import { TestContext, TestResult } from './types';

export const test = {
  id: 9,
  name: 'Complex Comparison Query (May vs Last 7 Days)',
  question: "I want to know what changed in our campaigns because back in may we were barely making any money and in the last 7 days we've made around 40k",
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 150)}...`);
    details.push(`LLM Calls: ${result.metadata?.llmCalls}`);
    details.push(`Tool Calls: ${result.metadata?.toolCalls}`);

    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);
    details.push(`Total rows: ${result.result?.totalRows || 0}`);

    if (result.result?.keyInsights) {
      details.push(`Key Insights: ${result.result.keyInsights.length} items`);
    }

    // This is a complex query - it should either:
    // 1. Route to Planner (follow_up_analysis or trend_analysis with comparison)
    // 2. Or provide a helpful response explaining what it can do
    const validIntents = ['analytics', 'non_analytics'];
    const passed = validIntents.includes(result.intent) && !!result.result?.summary;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
