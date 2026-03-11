import { AnalyticsWorkflow } from '../../src';

export interface TestResult {
  name: string;
  passed: boolean;
  intent: string;
  details: string[];
}

export interface TestContext {
  workflow: AnalyticsWorkflow;
  sessionId: string;
}

export type TestFunction = (ctx: TestContext) => Promise<TestResult>;

export interface TestDefinition {
  id: number;
  name: string;
  question: string;
  run: TestFunction;
}
