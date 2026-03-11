import { TestContext, TestResult } from './types';

export const test = {
  id: 4,
  name: 'Off-Topic Question',
  question: 'What day is today?',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 100)}...`);

    const hasHelpfulResponse =
      result.result?.summary?.toLowerCase().includes('analytics') ||
      result.result?.summary?.toLowerCase().includes('campaign') ||
      result.result?.summary?.toLowerCase().includes('help');

    const passed = result.intent === 'non_analytics' && !!hasHelpfulResponse;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
