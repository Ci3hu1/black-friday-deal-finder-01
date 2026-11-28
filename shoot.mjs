// Dev-only screenshot driver for Price Ledger v2 (NOT part of the entry).
// Serves app/ with serve.ts, opens each shot in headless Chromium, waits
// for window.__shotReady, saves a JPEG, and records every network request
// to prove zero external requests.
// Usage: node shoot.mjs [--port 8091]
import { chromium } from '/home/hatch/workspace/tools/makefun/shot-tool-v4fix/node_modules/playwright-core/index.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv.find((a, i, arr) => arr[i - 1] === '--port') ?? 8091);

const shots = [
  { name: '1-board.jpg', w: 1280, h: 800, query: '#/' },
  { name: '2-filtered.jpg', w: 1280, h: 800, query: '#/?discount=50' },
  { name: '3-deal.jpg', w: 1280, h: 800, query: '#/deal/macbook-air-m5-13' },
  { name: '4-phone.jpg', w: 390, h: 844, query: '#/deal/airpods-pro-3', scrollToCompare: true },
];

const server = spawn('node', ['serve.ts', '--port', String(port)], { cwd: here, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 1500));
const pre = await fetch(`http://localhost:${port}/`).then((r) => r.text()).catch(() => '');
if (!pre.includes('Price Ledger')) {
  console.error(`PREFLIGHT FAILED on port ${port}: served page is not Price Ledger (got ${pre.length} chars)`);
  server.kill();
  process.exit(1);
}
const exe = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
if (!existsSync(exe)) {
  console.error('chromium executable not found:', exe);
  server.kill();
  process.exit(1);
}
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const failures = [];
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h } });
    const requests = [];
    const errors = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('response', (r) => {
      if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`);
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
    await page.goto(`http://localhost:${port}/${shot.query}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
    } catch {
      failures.push(`${shot.name}: __shotReady never fired`);
    }
    await page.waitForTimeout(400);
    if (shot.scrollToCompare) {
      await page.evaluate(() => {
        const t = document.querySelector('table.compare');
        if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 260);
      });
      await page.waitForTimeout(300);
    }
    const external = requests.filter((u) => !u.startsWith(`http://localhost:${port}`));
    if (external.length) failures.push(`${shot.name}: external requests: ${external.join(', ')}`);
    if (errors.length) failures.push(`${shot.name}: errors: ${errors.join(' | ')}`);
    console.log(`${shot.name}: ${requests.length} requests, all local: ${external.length === 0}`);
    await page.screenshot({ path: join(here, 'screenshots', shot.name), type: 'jpeg', quality: 78 });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('all shots OK');
