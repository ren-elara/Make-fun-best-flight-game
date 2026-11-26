/** Build the complete, deterministic launch-radar artifact in the grader's /output directory. */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

function option(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const assigned = process.argv.find((argument) => argument.startsWith(prefix));
  if (assigned !== undefined) return assigned.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] !== undefined) return process.argv[index + 1]!;
  return fallback;
}

const input = option('input', '/input');
const inputFile = input.endsWith('.json') ? input : join(input, 'snapshot.json');
const output = resolve(option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output'));

if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: snapshot not found at ${inputFile}; mount /input or pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: refusing to write an invalid board: ${issue}\n`);
  process.exit(1);
}

for (const name of ['board.json', 'data.js', 'dossier.json', 'dashboard', 'screenshots']) {
  rmSync(join(output, name), { recursive: true, force: true });
}
mkdirSync(output, { recursive: true, mode: 0o755 });
writeFileSync(join(output, 'board.json'), `${JSON.stringify({ schema: 'token-radar/1', as_of: snapshot.as_of, rows: board })}\n`, { mode: 0o644 });
writeFileSync(join(output, 'data.js'), dataScript(radar), { mode: 0o644 });

function copyTree(source: string, destination: string): number {
  if (!existsSync(source)) throw new Error(`required directory is missing: ${source}`);
  mkdirSync(destination, { recursive: true, mode: 0o755 });
  let copied = 0;
  for (const name of readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const from = join(source, name);
    const to = join(destination, name);
    const stat = statSync(from);
    if (stat.isDirectory()) copied += copyTree(from, to);
    else if (stat.isFile()) {
      cpSync(from, to);
      copied++;
    } else {
      throw new Error(`unexpected non-file in hand-in directory: ${from}`);
    }
  }
  return copied;
}

const dashboardFiles = copyTree(join(root, 'dashboard'), join(output, 'dashboard'));
if (process.argv.includes('--preview')) {
  process.stdout.write(`token radar: preview data and ${dashboardFiles} dashboard files ready in ${output}\n`);
  process.exit(0);
}
const screenshotFiles = copyTree(join(root, 'screenshots'), join(output, 'screenshots'));
if (dashboardFiles === 0) throw new Error('dashboard/ is empty');
if (screenshotFiles < 3 || screenshotFiles > 4) throw new Error(`screenshots/ has ${screenshotFiles} files; the hand-in needs 3 or 4`);

const dossier = buildDossier(output, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(output, 'dossier.json'), dossier, { mode: 0o644 });

process.stdout.write(
  `token radar: ${snapshot.protocols.length} snapshot protocols; ${snapshot.watchlist.length}/${snapshot.watchlist.length} watchlist covered; ` +
  `${board.length} ranked pre-token rows; ${radar.live_size} live-token references\n` +
  `token radar: wrote ${join(output, 'board.json')}, ${join(output, 'dashboard')}, ${join(output, 'screenshots')} and ${join(output, 'dossier.json')}\n`,
);
