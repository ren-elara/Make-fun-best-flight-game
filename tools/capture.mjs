import { mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = process.env.TOKEN_RADAR_SNAPSHOT;
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR || join(root, 'out'));
if (!snapshot) {
  process.stderr.write('Set TOKEN_RADAR_SNAPSHOT to the sealed snapshot.json before capturing screenshots.\n');
  process.exit(2);
}

const build = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'main.ts'), '--input', snapshot, '--output', output, '--preview'], { encoding: 'utf8' });
if (build.stdout) process.stdout.write(build.stdout);
if (build.stderr) process.stderr.write(build.stderr);
if (build.status !== 0) process.exit(build.status || 1);

const screenshotDir = join(root, 'screenshots');
mkdirSync(screenshotDir, { recursive: true, mode: 0o755 });
const pageUrl = pathToFileURL(join(output, 'dashboard', 'index.html')).href;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1440 }, deviceScaleFactor: 1 });
const errors = [];
const nonLocalRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (!request.url().startsWith('file:')) nonLocalRequests.push(request.url());
});

try {
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#rows tr').length > 0);
  if (await page.locator('#rows tr').count() < 100) throw new Error('the rendered board does not cover the full candidate set');

  const captures = [
    { name: '01-radar-board.jpg', capture: async () => {} },
    {
      name: '02-protocol-detail.jpg',
      capture: async () => {
        await page.locator('[data-protocol]').first().click();
        await page.locator('#detail-dialog[open]').waitFor();
        await page.locator('.detail-value-card').waitFor();
        await page.locator('#detail-dialog').evaluate((dialog) => { dialog.scrollTop = 240; });
      },
    },
    {
      name: '03-filtered-radar.jpg',
      capture: async () => {
        if (await page.locator('#detail-dialog[open]').count()) {
          await page.locator('#detail-close').click();
          await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });
        }
        const category = await page.locator('#category-filter option').evaluateAll((options) => options.map((option) => option.value));
        await page.locator('#category-filter').selectOption(category.includes('Risk Curators') ? 'Risk Curators' : category.find((value) => value !== 'all'));
        await page.waitForFunction(() => Number(document.getElementById('result-count').textContent) > 0);
      },
    },
  ];

  for (const item of captures) {
    await item.capture();
    const path = join(screenshotDir, item.name);
    await page.screenshot({ path, type: 'jpeg', quality: 82, animations: 'disabled' });
    const bytes = statSync(path).size;
    if (bytes > 524_288) throw new Error(`${item.name} is ${bytes} bytes; reduce the capture quality or visual density`);
    process.stdout.write(`captured ${item.name} (${bytes} bytes)\n`);
  }

  await page.locator('[data-sort="name"]').click();
  const names = await page.locator('#rows .protocol-button strong').allTextContents();
  if (names.join('\n') !== [...names].sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())).join('\n')) throw new Error('the protocol name sort is not ascending');
  await page.locator('#tab-live').click();
  if (Number(await page.locator('#result-total').textContent()) !== await page.locator('#tab-live-count').evaluate((node) => Number(node.textContent))) {
    throw new Error('the live-token tab count does not match its separate reference rows');
  }
  const liveLead = await page.locator('#rows .protocol-button strong').first().textContent();
  const expectedLiveLead = await page.evaluate(() => window.RADAR.live[0].name);
  if (liveLead !== expectedLiveLead) throw new Error('the live-token reference list is not sorted by recorded market cap');
  await page.locator('[data-protocol]').first().click();
  if (!(await page.locator('#detail-content').innerText()).includes('RECORDED TOKEN MARKET CAP')) throw new Error('live-token details should show recorded market capitalization');
  await page.locator('#detail-close').click();
  await page.locator('#tab-candidates').click();
  await page.locator('#search').fill('no matching protocol can have this phrase');
  if (Number(await page.locator('#result-count').textContent()) !== 0 || !(await page.locator('#empty-state').isVisible())) {
    throw new Error('search should show its explicit empty state when no rows match');
  }
  await page.locator('#reset-filters').click();
  if (Number(await page.locator('#result-count').textContent()) < 100) throw new Error('clearing filters must restore the ranked board');
  await page.setViewportSize({ width: 390, height: 844 });
  const pageWidths = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  if (pageWidths.document > pageWidths.viewport) throw new Error(`mobile layout overflows the page: ${pageWidths.document}px for ${pageWidths.viewport}px`);
  if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
  if (nonLocalRequests.length) throw new Error(`dashboard requested non-local resources: ${nonLocalRequests.join(', ')}`);
} finally {
  await browser.close();
}
