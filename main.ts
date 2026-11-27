/** Deliver the offline flight game without a build step or an input snapshot. */
import { cpSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repository = dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf('--output');
const output = resolve(flag < 0 ? process.env.MAKEFUN_OUTPUT_DIR ?? '/output' : process.argv[flag + 1] ?? '');
if (flag >= 0 && (!process.argv[flag + 1] || process.argv[flag + 1]!.startsWith('--'))) {
  throw new Error('--output requires a directory');
}
if (output === resolve(output, '..')) throw new Error('The filesystem root cannot be an output directory.');
for (const name of ['game', 'screenshots']) {
  const source = join(repository, name);
  if (output === source || output.startsWith(source + sep) || source.startsWith(output + sep)) {
    throw new Error('The output directory must be separate from the game and screenshot sources.');
  }
}

function copyPlainFiles(source: string, target: string): void {
  if (!lstatSync(source).isDirectory()) throw new Error(`Expected directory: ${source}`);
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(source).sort()) {
    const from = join(source, name);
    const to = join(target, name);
    const info = lstatSync(from);
    if (info.isDirectory()) copyPlainFiles(from, to);
    else if (info.isFile()) cpSync(from, to);
    else throw new Error(`Refusing a symbolic link or special file: ${from}`);
  }
}

// Validate sources before replacing any generated output, including an older local build.
const dossier = buildDossier(repository, {
  text_max_bytes: 163_840,
  screenshots: { max: 4, max_bytes: 262_144 },
  game_max_files: 993,
  game_max_bytes: 50_331_648,
  game_path_max_bytes: 1000,
});
mkdirSync(output, { recursive: true });
for (const artifact of ['game', 'screenshots', 'dossier.json', 'board.json', 'data.js', 'dashboard']) {
  rmSync(join(output, artifact), { recursive: true, force: true });
}
copyPlainFiles(join(repository, 'game'), join(output, 'game'));
copyPlainFiles(join(repository, 'screenshots'), join(output, 'screenshots'));
writeFileSync(join(output, 'dossier.json'), dossier);
process.stdout.write(`AURELIA: offline flight game and deterministic dossier delivered to ${output}\n`);
