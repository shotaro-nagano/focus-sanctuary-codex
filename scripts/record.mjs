import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173/';
await fs.mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: 'artifacts', size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
await page.goto(`${base}?preview=inspect&quality=high`);
await page.waitForTimeout(4500);
await page.mouse.move(260, 330, { steps: 20 });
await page.mouse.down();
await page.mouse.move(1120, 610, { steps: 35 });
await page.mouse.up();
await page.screenshot({ path: 'artifacts/record-01-intro.png', fullPage: true });
await page.getByRole('button', { name: /SHORT/ }).click();
await page.waitForTimeout(2200);
await page.screenshot({ path: 'artifacts/record-02-short.png', fullPage: true });
await page.getByRole('button', { name: /LONG/ }).click();
await page.waitForTimeout(2200);
await page.screenshot({ path: 'artifacts/record-03-long.png', fullPage: true });
await page.evaluate(() => window.chrysalisPreview.complete());
await page.waitForTimeout(1400);
await page.screenshot({ path: 'artifacts/record-04-complete-flash.png', fullPage: true });
await page.waitForTimeout(3200);
await page.screenshot({ path: 'artifacts/record-05-complete-return.png', fullPage: true });
await page.getByRole('button', { name: /REPLAY/ }).click();
await page.waitForTimeout(3800);
const video = page.video();
await context.close();
const rawPath = await video.path();
await browser.close();
const target = 'artifacts/focus-sanctuary-demo.webm';
await fs.rm(target, { force: true });
await fs.rename(rawPath, target);
console.log(JSON.stringify({ video: target, frames: ['artifacts/record-01-intro.png', 'artifacts/record-02-short.png', 'artifacts/record-03-long.png', 'artifacts/record-04-complete-flash.png', 'artifacts/record-05-complete-return.png'] }, null, 2));
