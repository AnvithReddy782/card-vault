import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const browseBin = path.join(os.homedir(), '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse.exe');

function run(cmd) {
  return execSync(`"${browseBin}" ${cmd}`, { encoding: 'utf-8', timeout: 15000 });
}

console.log('Navigating to http://localhost:3000...');
run('goto http://localhost:3000');
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');

// 1. Dashboard Tab
console.log('Capturing Dashboard tab...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Dashboard')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/dashboard-live.png');

// 2. Scanner Tab
console.log('Capturing Scanner tab...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Scanner')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/scanner-live.png');

// 3. Contacts Database Tab
console.log('Switching to Contacts Database...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Contacts')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/contacts-live.png');

// 4. Export & Sync tab
console.log('Switching to Export & Sync...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Export')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/export-live.png');

// Copy all screenshots to artifacts directory
const artifactDir = 'C:\\Users\\anvit\\.gemini\\antigravity\\brain\\1295712d-d56d-4ad2-8e19-fdbe2fe53894';
execSync(`powershell -NoProfile -Command "Copy-Item tests/*.png '${artifactDir}\\'"`);
console.log('All tab screenshots captured and copied to artifacts directory.');
