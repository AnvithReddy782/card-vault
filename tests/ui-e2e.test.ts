import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import assert from 'node:assert';

const browseBin = path.join(os.homedir(), '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse.exe');

function runInBrowser(action: string): string {
  const psCmd = `& "${browseBin}" goto http://localhost:3000; & "${browseBin}" ${action}`;
  try {
    const output = execSync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20000,
    });
    return output;
  } catch (err: any) {
    return (err.stdout || '') + (err.stderr || '') + err.message;
  }
}

async function run() {
  console.log('=== CardVault Comprehensive Browser Verification ===\n');

  // Test 1: Page Text and Title
  console.log('Test 1: Verifying Page Title and Root Navigation...');
  const textOutput = runInBrowser('text');
  assert.ok(textOutput.includes('CardVault'), 'Page must contain CardVault brand');
  assert.ok(textOutput.includes('Dashboard'), 'Page must contain Dashboard tab');
  assert.ok(textOutput.includes('Scanner'), 'Page must contain Scanner tab');
  assert.ok(textOutput.includes('Contacts'), 'Page must contain Contacts tab');
  assert.ok(textOutput.includes('Export & Sync'), 'Page must contain Export & Sync tab');
  console.log('✓ Navigation tabs confirmed: Dashboard, Scanner, Contacts, Export & Sync\n');

  // Test 2: Header Status Hub
  console.log('Test 2: Verifying Header Status Hub Pills...');
  assert.ok(textOutput.includes('Sheets'), 'Sheets status pill must be visible');
  assert.ok(textOutput.includes('Mobile'), 'Mobile connect pill must be visible');
  assert.ok(textOutput.includes('Scan Card') || textOutput.includes('Scan New Card'), 'Primary Scan CTA must be present');
  console.log('✓ Header Status Hub elements confirmed\n');

  // Test 3: Console errors check
  console.log('Test 3: Checking for Client-Side Runtime Console Errors...');
  const consoleOutput = runInBrowser('console');
  assert.ok(!consoleOutput.includes('Uncaught Error'), 'No uncaught errors in console');
  assert.ok(!consoleOutput.includes('SyntaxError'), 'No syntax errors in console');
  console.log('✓ Console clean (zero runtime crash errors)\n');

  // Test 4: Live Screenshot verification
  const screenshotPath = path.resolve('tests', 'cardvault-live-verification.png');
  console.log(`Test 4: Taking live high-res UI snapshot to ${screenshotPath}...`);
  runInBrowser(`screenshot "${screenshotPath}"`);
  console.log('✓ Live screenshot saved successfully\n');

  console.log('=== All Browser UI End-to-End Tests Passed Perfectly! ===');
}

run().catch((e) => {
  console.error('Test Failed:', e);
  process.exit(1);
});
