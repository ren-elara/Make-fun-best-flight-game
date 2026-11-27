import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildDossier, htmlFacts, readGameTree, resolveGamePath, sourceImports } from '../vendor/makefun-game.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
// Alpine's locally installed Node omits native TypeScript; the grader's Node includes it.
const runner = ['--import', import.meta.resolve('tsx')];
const caps = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648, game_path_max_bytes: 1000 };
const kitHelper = join(root, 'best-flight-game-20261126-0057-kit/starter/vendor/makefun-game.ts');
if (existsSync(kitHelper)) assert.deepEqual(readFileSync(join(root, 'vendor/makefun-game.ts')), readFileSync(kitHelper), 'official dossier helper must remain unchanged');

const tree = readGameTree(join(root, 'game'), caps);
assert.ok(tree.files.some((file) => file.path === 'index.html'), 'a playable game entry is required');
assert.ok(tree.files.filter((file) => /src\/.*\.js$/.test(file.path)).length >= 5, 'split flight, world, rendering and interaction responsibilities');
const facts = htmlFacts(readFileSync(join(root, 'game/index.html'), 'utf8'));
function localReference(reference, from) {
  if (reference.startsWith('data:')) return;
  const path = resolveGamePath(reference, from);
  assert.ok(path, `nonlocal or escaping reference: ${reference} in ${from}`);
  assert.ok(lstatSync(join(root, 'game', path)).isFile(), `missing reference: ${path}`);
}
for (const item of [...facts.scripts.filter((s) => s.src).map((s) => s.src), ...facts.links.map((l) => l.href), ...facts.resources.map((r) => r.src)]) localReference(item, 'index.html');
for (const file of tree.files) {
  if (!/\.(js|html|css)$/.test(file.path)) continue;
  const source = readFileSync(join(root, 'game', file.path), 'utf8');
  assert.doesNotMatch(source, /https?:\/\/|\bfetch\s*\(|\bWebSocket\b|\bXMLHttpRequest\b|\bimportScripts\s*\(/, `${file.path} must run offline`);
  if (file.path.endsWith('.js')) {
    const parsed = spawnSync(process.execPath, ['--check', join(root, 'game', file.path)], { encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
    for (const reference of sourceImports(source)) localReference(reference, file.path);
  }
  for (const [, reference] of source.matchAll(/url\(\s*["']?([^)'"\s]+)/g)) localReference(reference, file.path);
}

function jpegSize(path) {
  const data = readFileSync(path);
  assert.ok(data.length <= 262144, 'screenshots must fit 256 KiB');
  assert.equal(data.readUInt16BE(0), 0xffd8, 'browser captures must be JPEGs');
  assert.equal(data.readUInt16BE(data.length - 2), 0xffd9, 'JPEG must end with EOI');
  const frames = new Set([0xc0, 0xc1, 0xc2]);
  let offset = 2;
  while (offset + 4 < data.length) {
    assert.equal(data[offset++], 0xff);
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    const length = data.readUInt16BE(offset);
    if (frames.has(marker)) return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3) };
    offset += length;
  }
  assert.fail('JPEG dimensions not found');
}
const names = readdirSync(join(root, 'screenshots')).filter((name) => !name.startsWith('.'));
assert.ok(names.length >= 3 && names.length <= 4, 'screenshots/ needs 3 or 4 images');
for (const name of names) {
  assert.match(name, /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/);
  const { width, height } = jpegSize(join(root, 'screenshots', name));
  assert.ok(Math.max(width, height) <= 1280 && Math.min(width, height) >= 480, `screenshot dimensions: ${name}`);
}

function list(directory, prefix = '', result = new Map()) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const name = prefix + entry.name, path = join(directory, entry.name);
    if (entry.isDirectory()) list(path, name + '/', result);
    else { assert.ok(entry.isFile(), `${name}: regular files only`); result.set(name, readFileSync(path)); }
  }
  return result;
}

const scratch = mkdtempSync(join(tmpdir(), 'aurelia-upgrade-'));
try {
  const runs = [join(scratch, 'first'), join(scratch, 'second')];
  for (const output of runs) {
    const result = spawnSync(process.execPath, [...runner, join(root, 'main.ts'), '--output', output], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(readFileSync(join(output, 'dossier.json')), Buffer.from(buildDossier(output, caps)), 'official dossier bytes must match');
    const dossier = JSON.parse(readFileSync(join(output, 'dossier.json'), 'utf8'));
    assert.equal(dossier.schema, 'makefun/dossier/v1');
    assert.equal(dossier.images.length, names.length);
    assert.ok(dossier.text.includes('src/flight.js') && dossier.text.includes('src/render.js'));
    assert.doesNotMatch(dossier.text, /\[Cut at |lines not shown/);
    assert.ok(statSync(join(output, 'dossier.json')).size <= 1572864);
    const bytes = [...list(output).values()].reduce((total, value) => total + value.length, 0);
    assert.ok(bytes <= 67108864);
    assert.deepEqual(readdirSync(output).sort(), ['dossier.json', 'game', 'screenshots']);
  }
  const first = list(runs[0]), second = list(runs[1]);
  assert.deepEqual(first, second, 'independent output trees must be byte identical');
  writeFileSync(join(runs[0], 'game/stale.js'), 'throw new Error("obsolete");\n');
  writeFileSync(join(runs[0], 'screenshots/stale.jpg'), 'obsolete');
  writeFileSync(join(runs[0], 'board.json'), '{}');
  const repeated = spawnSync(process.execPath, [...runner, join(root, 'main.ts'), '--output', runs[0]], { encoding: 'utf8', timeout: 10000 });
  assert.equal(repeated.status, 0, repeated.stderr + repeated.stdout);
  assert.deepEqual(list(runs[0]), first, 'rebuilding replaces stale generated files and the old dashboard hand-in');

  // A fresh source copy intentionally contains no node_modules, token input, dashboard or kit.
  const clean = join(scratch, 'clean');
  for (const name of ['main.ts', 'game', 'screenshots', 'vendor/makefun-game.ts', 'package.json']) cpSync(join(root, name), join(clean, name), { recursive: true });
  const cleanOutput = join(scratch, 'clean-output');
  const cleanRun = spawnSync(process.execPath, [...runner, join(clean, 'main.ts'), '--output', cleanOutput], { cwd: clean, encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH } });
  assert.equal(cleanRun.status, 0, cleanRun.stderr + cleanRun.stdout);
  assert.deepEqual(list(cleanOutput), first, 'the dependency-free delivery must match the development output');
  const bad = spawnSync(process.execPath, [...runner, join(root, 'main.ts'), '--output', join(root, 'game')], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0, 'source directory cannot be used as output');
  assert.match(bad.stderr, /separate from/);
} finally { rmSync(scratch, { recursive: true, force: true }); }

process.stdout.write(`verified: ${tree.files.length} game files, local references, ${names.length} valid screenshots, exact dossier, deterministic outputs, dependency-free delivery\n`);
