import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, htmlFacts, importMapOf, readGameTree, resolveGamePath, sourceImports } from '../vendor/makefun-game.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const kit = { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648, game_path_max_bytes: 1000 };
const temp = mkdtempSync(join(tmpdir(), 'aurelia-repeat-build-'));

function tree(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).map((entry) => {
    const path = join(directory, entry.name), name = relative(directory, path);
    assert(!entry.isSymbolicLink(), `output contains a symlink: ${path}`);
    return entry.isDirectory() ? { name, children: tree(path) } : { name, bytes: readFileSync(path) };
  });
}
function compareTrees(a, b, prefix = '') {
  assert.equal(a.length, b.length, `${prefix}: entry count differs`);
  for (let i = 0; i < a.length; i++) {
    const left = a[i], right = b[i], name = `${prefix}/${left.name}`;
    assert.equal(left.name, right.name, `${name}: path differs`);
    if ('children' in left) compareTrees(left.children, right.children, name);
    else assert.deepEqual(left.bytes, right.bytes, `${name}: bytes differ across builds`);
  }
}

try {
  for (const name of ['a', 'b']) {
    const out = join(temp, name);
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'main.ts')], {
      cwd: root, env: { ...process.env, MAKEFUN_OUTPUT_DIR: out }, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, `build ${name} failed: ${result.stderr}`);
    const actual = readFileSync(join(out, 'dossier.json'));
    assert(actual.length <= 1572864, 'dossier exceeds the competition byte cap');
    assert.deepEqual(actual, Buffer.from(buildDossier(out, kit)), `build ${name} dossier does not match the official helper`);
    const game = readGameTree(join(out, 'game'), kit);
    const dossier = JSON.parse(actual);
    assert.equal(dossier.images.length, 4);
    assert(!dossier.text.includes('[Cut at'), 'game source should fit in full');
    const html = readFileSync(join(out, 'game', 'index.html'), 'utf8');
    const facts = htmlFacts(html), map = importMapOf(facts);
    assert.deepEqual(map, { map: null, error: null }, 'this game should not need an import map');
    for (const ref of [...facts.scripts.map((item) => item.src).filter(Boolean), ...facts.links.map((item) => item.href), ...facts.resources.map((item) => item.src)]) {
      if (ref.startsWith('data:')) continue;
      const path = resolveGamePath(ref, 'index.html');
      assert(path && game.files.some((file) => file.path === path), `missing page reference: ${ref}`);
    }
    for (const source of game.files.filter((file) => /\.m?js$/i.test(file.path))) {
      const code = readFileSync(join(out, 'game', source.path), 'utf8');
      for (const ref of sourceImports(code)) {
        if (ref.startsWith('data:')) continue;
        const path = resolveGamePath(ref, source.path);
        assert(path && game.files.some((file) => file.path === path), `${source.path}: unresolved import ${ref}`);
      }
    }
  }
  compareTrees(tree(join(temp, 'a')), tree(join(temp, 'b')));
  console.log('Two clean builds produced byte-identical game files and dossier.json.');
  console.log('Both dossiers match the unchanged make.fun helper; every page and module file reference resolves inside game/.');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
