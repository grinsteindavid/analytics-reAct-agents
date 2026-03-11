import { TestContext, TestResult } from './types';

export const test = {
  id: 7,
  name: 'Drilldown with Multiple Conditions',
  question: 'Show me campaigns with ROI over 5% and revenue greater than $100',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 80)}...`);
    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);
    details.push(`Total rows: ${result.result?.totalRows || 0}`);

    // Verify we got analytics with summary and data
    const totalRows = result.result?.totalRows || 0;
    const passed =
      result.intent === 'analytics' &&
      !!result.result?.summary &&
      totalRows > 0;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
