import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boardIssue, buildRadar, dataScript, isEarlyCandidate, isPreToken, parseSnapshot } from '../lib/model.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
function fileURLToPath(url) {
  return new URL(url).pathname;
}

const snapshotPath = process.env.TOKEN_RADAR_SNAPSHOT || process.argv[2];
if (!snapshotPath) {
  process.stderr.write('Set TOKEN_RADAR_SNAPSHOT to the sealed snapshot.json (or pass its path as the first argument).\n');
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(resolve(snapshotPath), 'utf8'));
const first = buildRadar(snapshot);
assert.equal(boardIssue(first.board, snapshot), null, 'the emitted board must pass all locally reproducible board checks');
assert.ok(first.board.length >= 100, 'the board must exceed the 100-row floor');
assert.equal(new Set(first.board.map((row) => row.slug)).size, first.board.length, 'protocol rows must be unique');
assert.deepEqual(snapshot.watchlist.filter((slug) => !first.board.some((row) => row.slug === slug)), [], 'the watchlist must be completely covered');
const expectedSlugs = snapshot.protocols.filter((protocol) => snapshot.watchlist.includes(protocol.slug) || isEarlyCandidate(protocol)).map((protocol) => protocol.slug).sort();
assert.deepEqual(first.board.map((row) => row.slug).sort(), expectedSlugs, 'every screened pre-token protocol at any snapshot TVL must be ranked');
assert.ok(first.board.every((row, index) => row.rank === index + 1), 'rank numbers must be contiguous');
assert.ok(first.board.every((row) => isPreToken(row)), 'ranked candidates must have no token fields recorded');
assert.ok(first.board.every((row) => Number.isFinite(row.model.peer_ratio_median) && row.model.peer_ratio_median > 0), 'every estimate needs a valid peer benchmark');
assert.ok(first.board.every((row) => row.farm_plan.length >= 3 && row.farm_plan.length <= 12), 'every candidate needs an actionable plan');
assert.ok(first.radar.live.length > 0 && first.radar.peer_size > 0, 'live-token references must be kept apart from the candidate board');
assert.equal(dataScript(first.radar), dataScript(buildRadar(snapshot).radar), 'the generated dashboard data must be deterministic');

const dashboardFiles = readdirSync(join(root, 'dashboard')).filter((name) => /\.(?:html|css|js)$/.test(name));
assert.ok(dashboardFiles.length >= 3, 'the dashboard must have separate HTML, styling and interaction source');
for (const name of dashboardFiles) {
  const source = readFileSync(join(root, 'dashboard', name), 'utf8');
  assert.doesNotMatch(source, /https?:\/\//i, `${name} must not request remote resources`);
}

function jpegDimensions(path) {
  const bytes = readFileSync(path);
  assert.ok(bytes.length <= 524_288, `${path} must fit the per-image byte cap`);
  assert.equal(bytes[0], 0xff, `${path} must be a JPEG`);
  assert.equal(bytes[1], 0xd8, `${path} must be a JPEG`);
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(offset);
    if (startOfFrame.has(marker)) return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    offset += length;
  }
  assert.fail(`${path} has no JPEG frame dimensions`);
}

for (const name of readdirSync(join(root, 'screenshots'))) {
  const { width, height } = jpegDimensions(join(root, 'screenshots', name));
  assert.ok(Math.max(width, height) <= 1440 && Math.min(width, height) >= 800, `${name} dimensions ${width}×${height} exceed screenshot bounds`);
}

function tree(directory, prefix, result) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) tree(path, name, result);
    else {
      assert.ok(entry.isFile(), `${name} must be a regular file`);
      result.set(name, readFileSync(path));
    }
  }
  return result;
}

const scratch = mkdtempSync(join(tmpdir(), 'token-radar-verify-'));
try {
  const runs = [join(scratch, 'first'), join(scratch, 'second')];
  for (const output of runs) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'main.ts'), '--input', resolve(snapshotPath), '--output', output], { encoding: 'utf8' });
    assert.equal(result.status, 0, `main.ts must build successfully:\n${result.stdout}\n${result.stderr}`);
    const board = JSON.parse(readFileSync(join(output, 'board.json'), 'utf8'));
    assert.equal(board.rows.length, first.board.length, 'the emitted file must contain the complete board');
    const dossier = JSON.parse(readFileSync(join(output, 'dossier.json'), 'utf8'));
    assert.equal(dossier.schema, 'makefun/dossier/v1', 'the official helper must write the expected dossier schema');
    assert.equal(dossier.images.length, 3, 'the dossier must carry the three authored screenshots');
    assert.ok(dossier.text.includes('### methodology.md'), 'the dossier must include the model notes the judge reads');
    assert.doesNotMatch(dossier.text, /\[Cut at /, 'the complete dashboard source must fit the dossier text cap');
    assert.ok(statSync(join(output, 'dossier.json')).size <= 1_572_864, 'the dossier must fit the official 1.5 MiB cap');
  }
  const one = tree(runs[0], '', new Map());
  const two = tree(runs[1], '', new Map());
  assert.deepEqual([...one.keys()].sort(), [...two.keys()].sort(), 'the two output trees must have identical files');
  for (const [name, bytes] of one) assert.deepEqual(bytes, two.get(name), `${name} must be byte-identical across clean runs`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.stdout.write(`verified: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist coverage, ${first.board.length} ranked rows, ${first.radar.peer_size} valuation peers, stable outputs\n`);
