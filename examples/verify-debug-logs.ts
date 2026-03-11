/**
 * Verify Debug Logs - Session-Based Structure
 * 
 * Checks the new session-based debug log structure:
 * - Session overview with all turns
 * - State snapshots (initial, after-tools, final)
 * - Full response data for debugging
 * - Turn summaries
 * 
 * Usage:
 *   npx ts-node examples/verify-debug-logs.ts [sessionId]
 */

import * as fs from 'fs';
import * as path from 'path';

const DEBUG_DIR = path.join(__dirname, '../.debug-logs/sessions');

function main() {
  console.log('🔍 Verifying Debug Logs (Session-Based)\n');
  console.log('━'.repeat(70));

  if (!fs.existsSync(DEBUG_DIR)) {
    console.log('❌ Debug logs directory not found');
    console.log('   Run: DEBUG=true npx ts-node examples/e2e-workflow-test.ts');
    process.exit(1);
  }

  // Get session ID from args or use latest
  const sessionId = process.argv[2];
  let sessionDir: string;

  if (sessionId) {
    sessionDir = path.join(DEBUG_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
      console.log(`❌ Session not found: ${sessionId}`);
      process.exit(1);
    }
  } else {
    // Get latest session
    const sessions = fs.readdirSync(DEBUG_DIR)
      .filter(d => fs.statSync(path.join(DEBUG_DIR, d)).isDirectory())
      .sort()
      .reverse();

    if (sessions.length === 0) {
      console.log('❌ No sessions found');
      process.exit(1);
    }
    sessionDir = path.join(DEBUG_DIR, sessions[0]!);
  }

  const sessionFile = path.join(sessionDir, 'session.json');
  if (!fs.existsSync(sessionFile)) {
    console.log('❌ session.json not found');
    process.exit(1);
  }

  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
  console.log(`\n📂 Session: ${session.sessionId}`);
  console.log(`   Created: ${session.createdAt}`);
  console.log(`   Turns: ${session.turns.length}`);
  console.log('━'.repeat(70));

  // Display session overview
  console.log('\n📋 SESSION OVERVIEW\n');
  for (const turn of session.turns) {
    const contextInfo = turn.previousContext
      ? ` (prev: ${turn.previousContext.historyLength} turns)`
      : ' (fresh)';
    console.log(`  Turn ${turn.turn}: ${turn.intent}${contextInfo}`);
    console.log(`    Q: "${turn.question}"`);
    console.log(`    Duration: ${turn.duration}ms`);
    if (turn.previousContext?.entityIds) {
      const ids = turn.previousContext.entityIds;
      if (ids.campaignIds?.length) console.log(`    └─ Campaigns: ${ids.campaignIds.length}`);
      if (ids.trafficSourceIds?.length) console.log(`    └─ Traffic Sources: ${ids.trafficSourceIds.length}`);
    }
    console.log('');
  }

  // Verify each turn
  console.log('━'.repeat(70));
  console.log('\n📁 TURN DETAILS\n');

  let allPassed = true;

  for (const turnInfo of session.turns) {
    const turnDir = path.join(sessionDir, turnInfo.folder);
    console.log(`\n── Turn ${turnInfo.turn}: ${turnInfo.folder} ──`);

    if (!fs.existsSync(turnDir)) {
      console.log('  ❌ Turn folder not found');
      allPassed = false;
      continue;
    }

    const files = fs.readdirSync(turnDir).filter(f => f.endsWith('.json')).sort();
    console.log(`  Files: ${files.join(', ')}`);

    // Check required files
    const hasStateInitial = files.some(f => f.includes('state_initial'));
    const hasStateFinal = files.some(f => f.includes('state_final'));
    const hasTurnJson = files.includes('turn.json');

    if (!hasStateInitial) { console.log('  ❌ Missing state_initial'); allPassed = false; }
    if (!hasStateFinal) { console.log('  ❌ Missing state_final'); allPassed = false; }
    if (!hasTurnJson) { console.log('  ❌ Missing turn.json'); allPassed = false; }

    // Check state files
    for (const file of files) {
      const filepath = path.join(turnDir, file);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

      if (file.includes('state_initial')) {
        console.log(`  📊 Initial State:`);
        console.log(`     History: ${content.metadata?.historyLength || 0} turns`);
      } else if (file.includes('state_after_tools')) {
        console.log(`  📊 After Tools:`);
        console.log(`     Changes: ${JSON.stringify(content.changes?.fromInitial || {})}`);
        if (content.state?.drilldownData) {
          console.log(`     Drilldown: ${content.state.drilldownData.rowCount} rows`);
        }
      } else if (file.includes('state_final')) {
        console.log(`  📊 Final State:`);
        console.log(`     History: ${content.metadata?.conversationHistoryLength || 0} turns`);
      } else if (file.includes('drilldown')) {
        console.log(`  🔍 Drilldown: ${content.responseMetadata?.rowCount} rows`);
        if (content.response) {
          console.log(`     ✅ Full response data present`);
        }
      } else if (file.includes('trend')) {
        console.log(`  📈 Trend: ${content.responseMetadata?.rowCount} rows`);
        if (content.csvData) {
          console.log(`     ✅ Full CSV data present`);
        }
      } else if (file.includes('traffic-source')) {
        console.log(`  🚦 Traffic Sources: ${content.responseMetadata?.count}`);
        if (content.responseMetadata?.names) {
          console.log(`     Names: ${content.responseMetadata.names.join(', ')}`);
        }
      }
    }
  }

  console.log('\n' + '━'.repeat(70));
  if (allPassed) {
    console.log('✅ ALL VERIFICATIONS PASSED');
  } else {
    console.log('❌ SOME VERIFICATIONS FAILED');
  }
  console.log('━'.repeat(70));
}

main();
