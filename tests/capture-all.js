import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/anvit/.gemini/antigravity/brain/1295712d-d56d-4ad2-8e19-fdbe2fe53894';

async function capture() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Set console error listener
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.toString()));
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  // 1. Desktop 1280x800
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-desktop-dashboard.png') });

  // Scanner Tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Scanner'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-desktop-scanner.png') });

  // Contacts Tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Contacts Database') || b.textContent.includes('Contacts'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-desktop-contacts.png') });

  // Export Tab
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Export & Sync') || b.textContent.includes('Export'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-desktop-export.png') });

  // 2. Mobile 390x844
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-mobile-dashboard.png') });

  // Mobile Scanner
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const btn = nav ? Array.from(nav.querySelectorAll('button')).find(b => b.textContent.includes('Scanner')) : null;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-mobile-scanner.png') });

  // Mobile Contacts
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    const btn = nav ? Array.from(nav.querySelectorAll('button')).find(b => b.textContent.includes('Contacts')) : null;
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-mobile-contacts.png') });

  // Mobile Contact Review Modal
  await page.evaluate(() => {
    const reviewBtn = document.querySelector('button[id^="mobile-review-btn-"]');
    if (reviewBtn) reviewBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-mobile-review.png') });

  // Close modal
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));

  // Open Mobile Connect Modal
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Mobile') || b.getAttribute('title')?.includes('Mobile'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit-mobile-connect.png') });

  console.log('Capture complete. Errors found:', pageErrors);
  await browser.close();
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
