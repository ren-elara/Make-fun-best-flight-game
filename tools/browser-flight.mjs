import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { serveFlight } from './serve-flight.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const capture = process.argv.includes('--capture');
const server = await serveFlight(join(root, 'game'), 0);
let browser;
const errors = [], external = [], failures = [];
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failures.push(request.url() + ': ' + request.failure()?.errorText));
  page.on('response', (response) => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['file:', 'data:'].includes(url.protocol) && url.hostname !== '127.0.0.1') external.push(request.url());
  });
  const state = () => page.evaluate(() => Aurelia.runtime.snapshot());
  const frames = async (count = 5) => {
    const before = (await state()).frameCount;
    await page.waitForFunction((start) => Aurelia.runtime.snapshot().frameCount > start, before + count, { timeout: 30000 });
  };
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.waitForFunction(() => Boolean(globalThis.Aurelia?.runtime));
  assert.equal((await state()).status, 'briefing');
  assert.ok(await page.evaluate(() => Aurelia.runtime.terrainPolygons()) > 100);
  await page.locator('#launch').click();
  await frames();
  assert.equal((await state()).status, 'flying');
  await page.keyboard.down('ArrowRight');
  const start = await state();
  await page.waitForFunction((heading) => Aurelia.runtime.snapshot().heading > heading + .01, start.heading);
  await page.keyboard.up('ArrowRight');
  assert.ok((await state()).roll > 0);
  await page.keyboard.down('ArrowUp');
  const altitude = (await state()).y;
  await page.waitForFunction((y) => Aurelia.runtime.snapshot().y > y + .3, altitude);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('KeyW');
  const throttle = (await state()).throttle;
  await page.waitForFunction((t) => Aurelia.runtime.snapshot().throttle > t + .04, throttle);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('g');
  assert.equal((await state()).gear, true);
  await page.keyboard.press('v');
  assert.equal((await state()).closeCamera, true);
  await page.keyboard.press('m');
  await page.mouse.move(1000, 250);
  assert.equal((await state()).mouse, true);
  await frames();
  await page.keyboard.press('m');
  await page.keyboard.press('p');
  assert.equal((await state()).status, 'paused');
  const frozen = await state();
  await frames(10);
  assert.equal((await state()).elapsed, frozen.elapsed);
  await page.locator('#resume').click();
  assert.equal((await state()).status, 'flying');
  await page.keyboard.press('r');
  assert.equal((await state()).gear, false);
  assert.equal((await state()).gate, 0);
  await page.keyboard.press('Escape');
  await page.locator('#return').click();
  assert.equal((await state()).status, 'briefing');
  await page.locator('[data-mission="1"]').click();
  assert.equal((await state()).mission, 1);
  await page.keyboard.press('3');
  assert.equal((await state()).mission, 2);
  await page.setViewportSize({ width: 900, height: 640 });
  await frames();
  assert.deepEqual(await page.locator('#flight').evaluate((c) => [c.width, c.height]), [900, 640]);
  assert.ok(await page.locator('#launch').isVisible());

  // file:// is tested separately with networking disabled: no server is needed to play.
  await context.setOffline(true);
  await page.goto(pathToFileURL(join(root, 'game/index.html')).href);
  await page.waitForFunction(() => Boolean(globalThis.Aurelia?.runtime));
  await page.locator('#launch').click();
  await frames();
  assert.equal((await state()).status, 'flying');
  await page.keyboard.press('p');
  await page.locator('#return').click();
  await context.setOffline(false);
  await page.setViewportSize({ width: 1280, height: 800 });

  if (capture) {
    const directory = join(root, 'screenshots');
    mkdirSync(directory, { recursive: true });
    const captures = [
      { name: '01-lantern-coast.jpg', mission: 0, close: false },
      { name: '02-whitewing-rescue.jpg', mission: 1, close: false },
      { name: '03-nightglass-approach.jpg', mission: 2, close: false },
      { name: '04-courier-detail.jpg', mission: 0, close: true },
    ];
    for (const item of captures) {
      await page.goto(pathToFileURL(join(root, 'game/index.html')).href);
      await page.locator(`[data-mission="${item.mission}"]`).click();
      await page.locator('#launch').click();
      if (item.close) await page.keyboard.press('v');
      if (item.mission === 2) await page.keyboard.press('g');
      await frames(3);
      await page.screenshot({ path: join(directory, item.name), type: 'jpeg', quality: 87, animations: 'disabled' });
      assert.ok(statSync(join(directory, item.name)).size <= 262144);
      process.stdout.write(`captured ${item.name} (${statSync(join(directory, item.name)).size} bytes)\n`);
    }
    // Only remove superseded generated images after every new render succeeded.
    for (const name of readdirSync(directory)) if (/\.(jpg|jpeg|png)$/i.test(name) && !captures.some((c) => c.name === name)) rmSync(join(directory, name));
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(external, [], 'no external network requests');
  assert.deepEqual(failures, [], 'all local files load');
  process.stdout.write('browser verified: launch, controls, mouse, gear, camera, pause, restart, contract selection, resize, and offline file play\n');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
