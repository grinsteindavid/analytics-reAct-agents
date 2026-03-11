import { TestContext, TestResult } from './types';

export const test = {
  id: 10,
  name: 'Complex Multi-Dimension Analysis (Region + Device + Offers)',
  question:
    'In the last three days, not including today, give me the top-performing offers per region + device. Also identify any region + device combinations where no offers are performing (meaning all offers have negative ROI).',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 200)}...`);
    details.push(`LLM Calls: ${result.metadata?.llmCalls}`);
    details.push(`Tool Calls: ${result.metadata?.toolCalls}`);

    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);

    // Get metrics from last turn
    const lastTurn = result.conversationHistory?.[result.conversationHistory.length - 1];
    if (lastTurn?.metricsIncluded) {
      details.push(`Metrics: ${lastTurn.metricsIncluded.join(', ')}`);
    }

    const totalRows = result.result?.totalRows || 0;
    details.push(`Total rows: ${totalRows}`);

    if (result.result?.keyInsights) {
      details.push(`Key Insights: ${result.result.keyInsights.length} items`);
      result.result.keyInsights.slice(0, 3).forEach((insight, i) => {
        details.push(`  Insight ${i + 1}: ${insight.substring(0, 100)}...`);
      });
    }

    // This complex query should:
    // 1. Be classified as analytics (multi-dimension analysis)
    // 2. Return data with region/device grouping
    // 3. Provide insights about negative ROI combinations
    const validIntents = ['analytics'];
    const hasSummary = !!result.result?.summary;
    const hasData = totalRows > 0;

    const passed = validIntents.includes(result.intent) && hasSummary && hasData;

    if (!passed) {
      details.push(`--- FAILURE REASONS ---`);
      if (!validIntents.includes(result.intent)) {
        details.push(`  Invalid intent: ${result.intent} (expected one of: ${validIntents.join(', ')})`);
      }
      if (!hasSummary) details.push(`  Missing summary`);
      if (!hasData) details.push(`  Missing data (totalRows: ${totalRows})`);
    }

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
