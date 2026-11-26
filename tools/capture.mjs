import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { withBrowser, openGame } from './browser.mjs';

const destination = process.env.MAKEFUN_CAPTURE_DIR ?? fileURLToPath(new URL('../screenshots/', import.meta.url));
const shots = [
  ['01-lantern-coast.jpg', 'coast'],
  ['02-whitewing-rescue.jpg', 'storm'],
  ['03-precision-gate.jpg', 'beacon'],
  ['04-nightglass-approach.jpg', 'landing'],
];
mkdirSync(destination, { recursive: true });
await withBrowser(async ({ context, origin }) => {
  for (const [filename, shot] of shots) {
    const page = await openGame(context, origin, shot);
    const image = await page.screenshot({ type: 'jpeg', quality: 90 });
    await page.close();
    const repeat = await openGame(context, origin, shot);
    const repeatedImage = await repeat.screenshot({ type: 'jpeg', quality: 90 });
    await repeat.close();
    assert.deepEqual(image, repeatedImage, `${shot}: browser capture changed across identical frozen states`);
    assert(image.length <= 262144, `${filename}: exceeds screenshot byte cap`);
    writeFileSync(join(destination, filename), image);
    console.log(`${filename}: 1280×720, ${image.length} bytes; repeat capture identical`);
  }
});
