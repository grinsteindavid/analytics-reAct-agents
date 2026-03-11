/**
 * E2E Workflow Test Runner
 *
 * Usage:
 *   npx ts-node examples/e2e-workflow-test.ts           # Run all tests
 *   npx ts-node examples/e2e-workflow-test.ts 1         # Run test 1 only
 *   npx ts-node examples/e2e-workflow-test.ts 1,2       # Run tests 1 and 2
 *   npx ts-node examples/e2e-workflow-test.ts 1-3       # Run tests 1 through 3
 *
 * Tests share the same sessionId to simulate multi-turn conversations.
 */

require('dotenv').config();
import mongoose = require('mongoose');
import { initDataSources } from '../src/data-access';
import { AnalyticsWorkflow, initLLMCache } from '../src';
import { allTests, getTestsByIds, parseTestArgs, TestEntry } from './tests';
import { TestResult, TestContext } from './tests/types';

async function initConnections() {
  const dataSources = await initDataSources({
    postgresUrl: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/analytics',
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/analytics',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  initLLMCache();

  return {
    mongoose: dataSources.mongoose,
    mongooseConnection: mongoose.connection,
    dataSources,
  };
}

async function closeConnections(_context: any) {
  if (mongoose.connection) await mongoose.connection.close();
}

function logTest(testNum: number, name: string, question: string) {
  console.log('\n' + '═'.repeat(80));
  console.log(`TEST ${testNum}: ${name}`);
  console.log('═'.repeat(80));
  if (question !== 'N/A - Verifies debug log structure') {
    console.log(`Question: "${question}"`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testIds = parseTestArgs(args);
  const testsToRun: TestEntry[] = testIds ? getTestsByIds(testIds) : allTests;

  console.log('🧪 E2E Workflow Test Suite\n');
  if (testIds) {
    console.log(`Running tests: ${testIds.join(', ')}\n`);
  } else {
    console.log('Running all tests\n');
  }

  const context = await initConnections();
  console.log('✅ Database connections initialized\n');

  const workflow = new AnalyticsWorkflow(context, 'gpt-4o-mini');
  const sessionId = `e2e_test_${Date.now()}`;
  console.log(`📝 Session ID: ${sessionId}`);

  const testContext: TestContext = { workflow, sessionId };
  const results: TestResult[] = [];

  for (const test of testsToRun) {
    logTest(test.id, test.name, test.question);

    const result = await test.run(testContext);
    results.push(result);

    result.details.forEach((d) => console.log(`  ${d}`));
    console.log(result.passed ? '\n✅ PASSED' : '\n❌ FAILED');

    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${r.name} (intent: ${r.intent})`);
    if (!r.passed) allPassed = false;
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log(`Session: ${sessionId}`);
  console.log('─'.repeat(80));

  await closeConnections(context);
  console.log('\n🔌 Connections closed');
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
