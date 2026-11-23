import { execSync } from 'child_process';
import path from 'path';
import os from 'os';

const browseBin = path.join(os.homedir(), '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse.exe');

function run(cmd) {
  return execSync(`"${browseBin}" ${cmd}`, { encoding: 'utf-8', timeout: 15000 });
}

console.log('Navigating to http://localhost:3000 on mobile viewport (390x844)...');
run('goto http://localhost:3000');
run('viewport 390x844');
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');

// 1. Open Contacts Tab on Mobile
console.log('Opening Contacts tab...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Contacts')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');

// 2. Click the first Review / Edit button
console.log('Clicking Review / Edit on first contact...');
run(`js "const b = document.querySelector('button[id^=\\"mobile-review-btn-\\"]:not([disabled])'); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 1200"');
run('screenshot tests/mobile-review-modal.png');

// Switch to Card Photo pane
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('Card Photo')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 600"');
run('screenshot tests/mobile-review-photo.png');

// Close review modal
run(`js "const b = document.querySelector('button[aria-label=\\"Close review\\"]') || Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('✕') || (x.title && x.title.includes('Close'))); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 600"');

// 3. Open Mobile Connect Modal
console.log('Opening Mobile Connect Modal...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.title && x.title.includes('Mobile')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-connect-modal.png');

// Copy screenshots to artifact directory
const artifactDir = 'C:\\Users\\anvit\\.gemini\\antigravity\\brain\\1295712d-d56d-4ad2-8e19-fdbe2fe53894';
execSync(`powershell -NoProfile -Command "Copy-Item tests/mobile-review-*.png '${artifactDir}\\'"`);
execSync(`powershell -NoProfile -Command "Copy-Item tests/mobile-connect-modal.png '${artifactDir}\\'"`);
console.log('Captured and copied.');
