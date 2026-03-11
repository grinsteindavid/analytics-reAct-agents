import { TestFunction } from './types';
import * as test01 from './01-drilldown-traffic-source';
import * as test02 from './02-followup-cpc';
import * as test03 from './03-followup-campaign-status';
import * as test04 from './04-off-topic';
import * as test05 from './05-trend-analysis';
import * as test06 from './06-new-query-different-filter';
import * as test07 from './07-drilldown-conditions';
import * as test08 from './08-debug-logs';
import * as test09 from './09-comparison-query';
import * as test10 from './10-complex-multi-dimension';
import * as test11 from './11-entity-lookup-rotation';
import * as test12 from './12-turn-reference';

export interface TestEntry {
  id: number;
  name: string;
  question: string;
  run: TestFunction;
}

export const allTests: TestEntry[] = [
  { id: test01.test.id, name: test01.test.name, question: test01.test.question, run: test01.run },
  { id: test02.test.id, name: test02.test.name, question: test02.test.question, run: test02.run },
  { id: test03.test.id, name: test03.test.name, question: test03.test.question, run: test03.run },
  { id: test04.test.id, name: test04.test.name, question: test04.test.question, run: test04.run },
  { id: test05.test.id, name: test05.test.name, question: test05.test.question, run: test05.run },
  { id: test06.test.id, name: test06.test.name, question: test06.test.question, run: test06.run },
  { id: test07.test.id, name: test07.test.name, question: test07.test.question, run: test07.run },
  { id: test08.test.id, name: test08.test.name, question: test08.test.question, run: test08.run },
  { id: test09.test.id, name: test09.test.name, question: test09.test.question, run: test09.run },
  { id: test10.test.id, name: test10.test.name, question: test10.test.question, run: test10.run },
  { id: test11.test.id, name: test11.test.name, question: test11.test.question, run: test11.run },
  { id: test12.test.id, name: test12.test.name, question: test12.test.question, run: test12.run },
];

export function getTestsByIds(ids: number[]): TestEntry[] {
  return allTests.filter((t) => ids.includes(t.id));
}

export function parseTestArgs(args: string[]): number[] | null {
  if (args.length === 0) return null;

  const tests: number[] = [];
  for (const arg of args) {
    if (arg.includes('-')) {
      const parts = arg.split('-').map(Number);
      const start = parts[0] ?? 1;
      const end = parts[1] ?? start;
      for (let i = start; i <= end; i++) tests.push(i);
    } else if (arg.includes(',')) {
      arg.split(',').map(Number).forEach((n) => tests.push(n));
    } else {
      tests.push(Number(arg));
    }
  }
  return tests;
}
