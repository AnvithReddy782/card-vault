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

// 1. Open OCR Settings Modal on mobile
console.log('Opening OCR settings modal on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.title && x.title.includes('Vision')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-modal-ocr.png');

// Close OCR modal
run(`js "const b = document.querySelector('button[aria-label=\\"Close settings\\"]'); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 600"');

// 2. Open Google Sheets Modal on mobile
console.log('Opening Google Sheets modal on mobile...');
run(`js "const b = Array.from(document.querySelectorAll('button')).find(x => x.title && x.title.includes('Google Sheets')); if(b) b.click();"`);
execSync('powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"');
run('screenshot tests/mobile-modal-sheets.png');

// Copy mobile screenshots to artifact directory
const artifactDir = 'C:\\Users\\anvit\\.gemini\\antigravity\\brain\\1295712d-d56d-4ad2-8e19-fdbe2fe53894';
execSync(`powershell -NoProfile -Command "Copy-Item tests/mobile-modal-*.png '${artifactDir}\\'"`);
console.log('Mobile modal screenshots captured and copied to artifacts directory.');
