// Independent, temporary browser acceptance; never attaches to a user's browser.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const out = path.join(root, '.runtime', 'browser');
await mkdir(out, { recursive: true });
execFileSync(process.execPath, ['build.mjs'], { cwd: root, stdio: 'pipe', timeout: 30000 });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let target;
    if (pathname === '/last-beacon-complete/' || pathname === '/last-beacon-complete/index.html') target = path.join(root, 'dist/last-beacon.html');
    else if (pathname.startsWith('/source/')) target = path.resolve(root, '.' + pathname.slice('/source'.length).replace(/\/$/, '/index.html'));
    else { res.writeHead(404); res.end(); return; }
    if (!target.startsWith(root) || pathname.includes('\\')) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(await readFile(target));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
const checks = [], errors = [], failedRequests = [], externalRequests = [];
const base = `http://127.0.0.1:${server.address().port}`;
async function check(name, ok) { assert.ok(ok, name); checks.push(name); console.log(`PASS ${name}`); }
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }));
  page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(base + '/')) externalRequests.push(r.url()); });
  async function shot(name) {
    const p = path.join(out, `${name}.png`);
    await page.screenshot({ path: p, fullPage: true });
    if (process.env.UPDATE_SCREENSHOTS === '1' && ['menu', 'battle'].includes(name)) await copyFile(p, path.join(root, 'docs/images', `${name}.png`));
  }
  async function ready() {
    await page.waitForFunction(() => !!window.__beacon && document.querySelector('#fatal').hidden);
    await page.waitForFunction(() => {
      const c = document.querySelector('#battlefield');
      return c.width > 0 && c.height > 0 && c.getContext('2d').getImageData(Math.floor(c.width * 0.7), Math.floor(c.height * 0.5), 1, 1).data[3] > 0;
    });
  }
  await page.goto(base + '/source/?test=1');
  await ready();
  await check('source modules initialize', await page.locator('#campaign-menu').isVisible());
  await page.goto(base + '/last-beacon-complete/?test=1');
  await ready();
  await check('Pages project subpath initializes', await page.locator('#campaign-menu').isVisible());
  await check('Canvas has painted actual pixels', await page.evaluate(() => { const c = document.querySelector('#battlefield'); return c.getContext('2d').getImageData(Math.floor(c.width * 0.7), Math.floor(c.height * 0.5), 1, 1).data[3] > 0; }));
  await shot('menu');
  await page.locator('#campaign-menu').click();
  await check('eight chapter map', await page.locator('.level-node').count() === 8);
  await page.locator('[data-action="launch-level"]').click();
  await check('chapter briefing and starter', await page.evaluate(() => document.querySelector('#modal').open && __beacon.game.towers.length === 1));
  await page.locator('#modal .primary[data-action="close"]').click();
  await page.locator('#pad-next').click();
  await page.locator('#pad-next').click();
  await page.locator('[data-build="mortar"]').click();
  await check('build preview', (await page.locator('#selection').innerText()).includes('建造预览'));
  await page.locator('[data-action="build"]').click();
  await check('build spends expected resources once', await page.evaluate(() => __beacon.game.towers.length === 2 && __beacon.game.credits === 200));
  await page.locator('#pad-next').click();
  await page.locator('[data-build="gun"]').click();
  await page.locator('[data-action="build"]').click();
  await check('second build', await page.evaluate(() => __beacon.game.towers.length === 3 && __beacon.game.credits === 135));
  await page.locator('#grid-toggle').click();
  await check('grid panel opens', await page.locator('#grid-panel').isVisible());
  await page.locator('[data-line="tie"]').click();
  await check('backup tie closes', await page.evaluate(() => __beacon.game.lines.find(l => l.id === 'tie').closed));
  await page.locator('#grid-close').click();
  await page.locator('#start-wave').click();
  await page.waitForFunction(() => __beacon.game.enemies.length > 0);
  // Keyboard focus must leave a button before testing the battlefield shortcut.
  await page.locator('#battlefield').click({ position: { x: 20, y: 200 } });
  await page.keyboard.press('Space');
  await check('space pauses battlefield', await page.evaluate(() => __beacon.game.paused));
  const elapsed = await page.evaluate(() => __beacon.game.elapsed);
  await page.waitForTimeout(250);
  await check('pause freezes simulation', await page.evaluate(n => __beacon.game.elapsed === n, elapsed));
  await page.locator('#grid-toggle').click();
  await shot('battle');
  await page.locator('#grid-close').click();
  await page.locator('#pause').click();
  await page.locator('#modal [data-action="settings"]').click();
  await check('settings open', await page.locator('#volume-input').isVisible());
  await page.locator('#volume-input').press('Home');
  await page.locator('#modal .primary[data-action="close"]').click();
  await check('settings preserve pause', await page.evaluate(() => __beacon.game.paused));
  await page.locator('#pause').click();
  await page.locator('#modal [data-action="home"]').click();
  await check('saved session can continue', await page.locator('#continue').isVisible());
  await page.locator('#continue').click();
  await page.locator('#modal [data-action="resume"]').click();
  await check('continue restores buildings', await page.evaluate(() => __beacon.game.towers.length === 3 && __beacon.game.wave === 1));
  await page.locator('#pause').click();
  await page.locator('#modal [data-action="retry-confirm"]').click();
  await page.locator('#modal [data-action="retry"]').click();
  await page.locator('#modal .primary[data-action="close"]').click();
  await check('retry resets initial resources', await page.evaluate(() => __beacon.game.wave === 0 && __beacon.game.credits === 300 && __beacon.game.towers.length === 1));
  await page.setViewportSize({ width: 390, height: 844 });
  await check('390px layout has no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= 390));
  await shot('narrow');
  await context.close();
  const offline = await browser.newContext({ offline: true, viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const filePage = await offline.newPage();
  const fileRequests = [];
  filePage.on('pageerror', e => errors.push(e.message));
  filePage.on('request', r => { if (/^https?:/.test(r.url())) fileRequests.push(r.url()); });
  await filePage.goto(pathToFileURL(path.join(root, 'dist/last-beacon.html')).href + '?test=1');
  await filePage.waitForFunction(() => !!window.__beacon && document.querySelector('#fatal').hidden);
  await filePage.locator('#campaign-menu').click();
  await filePage.locator('[data-action="launch-level"]').click();
  await filePage.locator('#modal .primary[data-action="close"]').click();
  await filePage.locator('#start-wave').click();
  await filePage.waitForFunction(() => __beacon.game.enemies.length > 0);
  await check('offline file plays without HTTP requests', fileRequests.length === 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(externalRequests, []);
  await offline.close();
  await writeFile(path.join(out, 'results.json'), JSON.stringify({ browserVersion: browser.version(), checks, runtimeErrors: errors, failedRequests, externalRequests, offlineFileHttpRequests: fileRequests, subpath: '/last-beacon-complete/', status: 'passed' }, null, 2));
  console.log(`All ${checks.length} browser checks passed.`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
