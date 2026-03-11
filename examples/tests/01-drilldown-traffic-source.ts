import { TestContext, TestResult } from './types';

export const test = {
  id: 1,
  name: 'Drilldown + Traffic Source Filter',
  question: 'Top 3 campaigns from Google by ROI in the last 2 weeks',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 80)}...`);
    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);
    details.push(`AccumulatedData: ${result.accumulatedData?.length || 0} datasets`);
    details.push(`Confidence: ${result.result?.confidence ? (result.result.confidence * 100).toFixed(0) + '%' : 'N/A'}`);

    // Show accumulated data details
    if (result.accumulatedData?.length) {
      result.accumulatedData.forEach((d, i) => {
        const size = Array.isArray(d.data) ? d.data.length : (d.data ? 'present' : 0);
        details.push(`  [${i}] ${d.type}: ${size} rows`);
      });
    }

    // "Top 3 campaigns from Google" = analytics (Planner handles entity lookup for traffic source)
    // Test passes if: intent is analytics, has summary, and has accumulated data
    const passed =
      result.intent === 'analytics' &&
      !!result.result?.summary &&
      (result.accumulatedData?.length || 0) > 0;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
