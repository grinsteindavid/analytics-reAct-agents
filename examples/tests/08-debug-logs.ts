import * as fs from 'fs';
import * as path from 'path';
import { TestContext, TestResult } from './types';

export const test = {
  id: 8,
  name: 'Debug Logs Verification',
  question: 'N/A - Verifies debug log structure',
};

export async function run(ctx: TestContext): Promise<TestResult> {
  const { sessionId } = ctx;
  const details: string[] = [];
  let allChecksPass = true;

  const sessionDir = path.join(__dirname, '../../.debug-logs/sessions', sessionId);

  if (!fs.existsSync(sessionDir)) {
    return {
      name: test.name,
      passed: false,
      intent: 'N/A',
      details: ['Session directory not found'],
    };
  }

  const sessionFile = path.join(sessionDir, 'session.json');
  if (fs.existsSync(sessionFile)) {
    const sessionInfo = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    details.push(`Session: ${sessionInfo.sessionId}`);
    details.push(`Total turns: ${sessionInfo.turns.length}`);

    for (const turn of sessionInfo.turns) {
      details.push(`  Turn ${turn.turn}: ${turn.intent} - "${turn.question.substring(0, 40)}..."`);
      if (turn.previousContext) {
        details.push(`    └─ Previous context: ${turn.previousContext.historyLength} turns`);
      }
    }
  } else {
    allChecksPass = false;
    details.push('❌ session.json not found');
  }

  const turnFolders = fs
    .readdirSync(sessionDir)
    .filter((d) => d.startsWith('turn_') && fs.statSync(path.join(sessionDir, d)).isDirectory());

  for (const turnFolder of turnFolders) {
    const turnPath = path.join(sessionDir, turnFolder);
    const files = fs.readdirSync(turnPath).filter((f) => f.endsWith('.json'));

    const hasStateInitial = files.some((f) => f.includes('state_initial'));
    const hasStateFinal = files.some((f) => f.includes('state_final'));
    const hasTurnJson = files.includes('turn.json');

    if (hasStateInitial && hasStateFinal && hasTurnJson) {
      details.push(`  ✅ ${turnFolder}: ${files.length} files (state tracking OK)`);
    } else {
      allChecksPass = false;
      details.push(`  ❌ ${turnFolder}: Missing state files`);
    }
  }

  return { name: test.name, passed: allChecksPass, intent: 'N/A', details };
}
