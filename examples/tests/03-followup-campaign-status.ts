import { TestContext, TestResult } from './types';

export const test = {
  id: 3,
  name: 'Follow-up Campaign Status',
  question: 'Which of those campaigns are active?',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { workflow, sessionId } = ctx;
  const details: string[] = [];

  try {
    const result = await workflow.execute(test.question, { sessionId });

    details.push(`Intent: ${result.intent}`);
    details.push(`Summary: ${result.result?.summary?.substring(0, 100)}...`);
    details.push(`ConversationHistory: ${result.conversationHistory?.length || 0} turns`);

    // "Which of those campaigns are active?" = analytics (references previous context for more data)
    // Could also be metadata_only if asking for pure metadata
    const passed =
      (result.intent === 'analytics' || result.intent === 'metadata_only') &&
      !!result.result?.summary;

    return { name: test.name, passed, intent: result.intent, details };
  } catch (error) {
    return { name: test.name, passed: false, intent: 'error', details: [String(error)] };
  }
}
