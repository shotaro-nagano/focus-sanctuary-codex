import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5173/';
await fs.mkdir('artifacts', { recursive: true });
const results = [];
const errors = [];
const check = (name, value, detail = '') => {
  results.push({ name, pass: Boolean(value), detail });
  if (!value) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
};

function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4); offset += 4;
    const data = buffer.subarray(offset, offset + length); offset += length + 4;
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[input++];
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y && x >= bpp ? pixels[(y - 1) * stride + x - bpp] : 0;
      const val = raw[input++];
      let out = val;
      if (filter === 1) out = val + left;
      else if (filter === 2) out = val + up;
      else if (filter === 3) out = val + Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        out = val + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      pixels[y * stride + x] = out & 255;
    }
  }
  return { width, height, pixels };
}

async function imageStats(path) {
  const { width, height, pixels } = decodePng(await fs.readFile(path));
  let bright = 0, varied = 0, sum = 0, sumSq = 0;
  const step = Math.max(1, Math.floor(width * height / 25000));
  for (let i = 0, px = 0; i < pixels.length; i += 4 * step, px++) {
    const l = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += l; sumSq += l * l;
    if (l > 18) bright++;
    const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (max - min > 10) varied++;
  }
  const samples = Math.ceil((pixels.length / 4) / step);
  const mean = sum / samples;
  const variance = sumSq / samples - mean * mean;
  return { width, height, brightRatio: bright / samples, variedRatio: varied / samples, variance };
}

async function newPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: options.reducedMotion || 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { context, page };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });

{
  const { context, page } = await newPage(browser);
  await page.goto(`${base}?preview=inspect&quality=high`);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: 'artifacts/desktop-final.png', fullPage: true });
  const webgl = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    return { ok: !!gl, renderer: gl?.getParameter(gl.RENDERER) || '', canvas: [canvas?.width || 0, canvas?.height || 0], notice: document.querySelector('#notice')?.textContent || '' };
  });
  check('desktop WebGL active', webgl.ok, JSON.stringify(webgl));
  check('desktop notice empty', webgl.notice === '', webgl.notice);
  const stats = await imageStats('artifacts/desktop-final.png');
  check('desktop screenshot nonblank', stats.brightRatio > 0.025 && stats.variance > 35, JSON.stringify(stats));
  check('desktop screenshot chromatic', stats.variedRatio > 0.025, JSON.stringify(stats));

  await page.goto(base);
  await page.waitForTimeout(800);
  await page.getByPlaceholder('いま、何に集中する？').fill('<b>literal task</b>');
  await page.getByRole('button', { name: /BEGIN FOCUS/ }).click();
  await page.waitForTimeout(1150);
  const afterStart = await page.locator('#time').textContent();
  check('timer decrements after start', afterStart !== '25:00', afterStart || '');
  await page.getByRole('button', { name: /PAUSE/ }).click();
  const paused = await page.locator('#time').textContent();
  await page.waitForTimeout(800);
  check('pause holds time', await page.locator('#time').textContent() === paused, paused || '');
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.getByRole('button', { name: /SHORT/ }).click();
  check('discard dialog opens during active mode switch', await page.locator('dialog[open]').count() === 1);
  await page.getByRole('button', { name: '続ける' }).click();
  check('cancel keeps focus mode', await page.getByRole('button', { name: /FOCUS 25/ }).getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: /SHORT/ }).click();
  await page.getByRole('button', { name: /破棄する/ }).click();
  check('discard changes to short mode', await page.getByRole('button', { name: /SHORT 05/ }).getAttribute('aria-pressed') === 'true');
  await page.reload();
  check('literal task persists as input text', await page.getByPlaceholder('いま、何に集中する？').inputValue() === '<b>literal task</b>');
  await context.close();
}

{
  const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await page.goto(`${base}?preview=inspect`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'artifacts/mobile-final.png', fullPage: true });
  const boxes = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom } : null;
    };
    return { scene: box('#scene'), timer: box('.timer-console'), footer: box('footer'), bottom: box('.bottom-line') };
  });
  check('mobile screenshot nonblank', (await imageStats('artifacts/mobile-final.png')).brightRatio > 0.025, JSON.stringify(await imageStats('artifacts/mobile-final.png')));
  check('mobile timer before footer', boxes.timer && boxes.footer && boxes.timer.bottom < boxes.footer.y + 20, JSON.stringify(boxes));
  await context.close();
}

{
  const { context, page } = await newPage(browser);
  await page.goto(`${base}?preview=inspect`);
  await page.evaluate(() => localStorage.setItem('focus-sanctuary.chrysalis.v1', 'sentinel'));
  await page.goto(`${base}?preview=complete`);
  await page.waitForTimeout(4500);
  check('preview mode does not write timer storage', await page.evaluate(() => localStorage.getItem('focus-sanctuary.chrysalis.v1')) === 'sentinel');
  await context.close();
}

{
  const { context, page } = await newPage(browser);
  const past = Date.now() - 1000;
  await page.addInitScript(state => localStorage.setItem('focus-sanctuary.chrysalis.v1', JSON.stringify(state)), {
    version: 1, task: 'boundary', mode: 'focus', status: 'running', remainingMs: 1500000, endsAt: past, sessionId: 'seed-focus', completed: []
  });
  await page.goto(base);
  await page.waitForTimeout(700);
  check('overdue focus completes once', await page.locator('#sessions').textContent() === '01');
  check('overdue focus advances to short idle', await page.getByRole('button', { name: /SHORT 05/ }).getAttribute('aria-pressed') === 'true');
  await page.reload();
  await page.waitForTimeout(500);
  check('overdue reload remains idempotent', await page.locator('#sessions').textContent() === '01');
  await context.close();
}

{
  const { context, page } = await newPage(browser, { reducedMotion: 'reduce' });
  await page.goto(`${base}?preview=inspect`);
  await page.waitForTimeout(800);
  check('reduced motion renders timer', await page.locator('#time').textContent() === '25:00');
  await context.close();
}

{
  const { context, page } = await newPage(browser);
  await page.goto(`${base}?preview=inspect`);
  await page.waitForTimeout(1200);
  const message = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_lose_context');
    if (!ext) return 'extension unavailable';
    ext.loseContext();
    await new Promise(resolve => setTimeout(resolve, 200));
    const lost = document.querySelector('#notice')?.textContent || '';
    ext.restoreContext();
    return lost;
  });
  check('context loss reports timer still usable', /タイマーは動作中/.test(message) || message === 'extension unavailable', message);
  await context.close();
}

await browser.close();
check('browser console has no errors', errors.length === 0, errors.join('\n'));
console.log(JSON.stringify({ base, results }, null, 2));
