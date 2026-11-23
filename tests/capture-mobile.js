import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const browseBin = path.join(os.homedir(), '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse.exe');

function run(cmd) {
  return execSync(`"${browseBin}" ${cmd}`, { encoding: 'utf-8', timeout: 15000 });
}

console.log('Navigating to http://localhost:3000 with mobile viewport (390x844)...');
run('goto http://localhost:3000');
run('viewport 390x844');
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');

// 1. Dashboard Tab Mobile
console.log('Capturing Dashboard tab on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Dashboard')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-dashboard.png');

// 2. Scanner Tab Mobile
console.log('Capturing Scanner tab on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Scanner')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-scanner.png');

// 3. Contacts Database Tab Mobile
console.log('Capturing Contacts tab on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Contacts')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-contacts.png');

// 4. Export Tab Mobile
console.log('Capturing Export tab on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Export')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-export.png');

// Copy mobile screenshots to artifact directory
const artifactDir = 'C:\\Users\\anvit\\.gemini\\antigravity\\brain\\1295712d-d56d-4ad2-8e19-fdbe2fe53894';
execSync(`powershell -NoProfile -Command "Copy-Item tests/mobile-*.png '${artifactDir}\\'"`);
console.log('Mobile screenshots captured and copied to artifacts directory.');
