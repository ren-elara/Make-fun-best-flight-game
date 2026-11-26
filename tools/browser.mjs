import { chromium } from 'playwright-core';
import { server } from '../serve.mjs';

export async function withBrowser(run) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const errors = [];
    context.on('page', (page) => {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(origin + '/') || url.startsWith('data:')) return route.continue();
      errors.push(`External request: ${url}`); return route.abort();
    });
    await run({ context, origin, errors });
    if (errors.length) throw new Error(errors.join('\n'));
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

export async function openGame(context, origin, shot = '') {
  const page = await context.newPage();
  await page.goto(`${origin}/${shot ? `?shot=${shot}` : ''}`);
  await page.waitForSelector('html[data-ready="true"]');
  return page;
}
