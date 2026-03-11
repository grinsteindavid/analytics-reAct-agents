import { TestContext, TestResult } from './types';

export const test = {
  id: 5,
  name: 'Trend Analysis with EPC',
  question: 'Show me EPC trends by campaign for the last 7 days',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 80)}...`);

    // Get metrics from conversationHistory (queryContext removed)
    const lastTurn = result.conversationHistory?.[result.conversationHistory.length - 1];
    const metricsIncluded = lastTurn?.metricsIncluded || [];

    details.push(`ConversationHistory turns: ${result.conversationHistory?.length || 0}`);
    details.push(`Metrics: ${metricsIncluded.join(', ') || 'none'}`);
    details.push(`Total rows: ${result.result?.totalRows || 0}`);

    // Verify EPC is in the metrics (tests metricsSelection feature)
    const hasEPC = metricsIncluded.includes('EPC');
    details.push(`EPC in metrics: ${hasEPC ? '✅ YES' : '❌ NO'}`);

    const totalRows = result.result?.totalRows || 0;
    const passed = result.intent === 'analytics' && !!result.result?.summary && totalRows > 0;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
