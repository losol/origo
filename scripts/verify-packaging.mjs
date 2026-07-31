#!/usr/bin/env node
/**
 * Verifies that every public workspace package would publish a usable tarball.
 *
 * For each non-private package under config/ and packages/ it packs the
 * package (dry run, which also runs `prepack`) and then checks that every
 * target referenced from `exports`, `main`, `module`, `types` and `bin`
 * actually exists in the tarball.
 *
 * This exists because the failure mode is invisible inside the monorepo:
 * workspace consumers resolve packages through a symlink to the source
 * directory, so a missing `files` entry or an export pointing at a file that
 * is never published only breaks for people installing from the registry.
 *
 * It also rejects export targets that point at raw TypeScript sources.
 * Node refuses to strip types for anything under node_modules
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so a package that maps a
 * subpath at `./src/*.ts` is unloadable for every registry consumer even when
 * the file is present in the tarball.
 */

import { execFileSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { dirname, posix } from 'node:path';

const PACKAGE_GLOBS = ['config/*/package.json', 'packages/*/package.json'];

/** Collects the file targets referenced by an `exports` subtree. */
function collectExportTargets(node, out = []) {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const entry of node) collectExportTargets(entry, out);
  } else if (node && typeof node === 'object') {
    for (const entry of Object.values(node)) collectExportTargets(entry, out);
  }
  return out;
}

function packedFiles(dir) {
  const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [result] = JSON.parse(raw);
  return new Set((result?.files ?? []).map(f => f.path));
}

const manifests = PACKAGE_GLOBS.flatMap(pattern => globSync(pattern)).sort();
let failed = false;

for (const manifest of manifests) {
  const dir = dirname(manifest);
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));

  if (pkg.private === true) {
    console.log(`skip (private): ${dir}`);
    continue;
  }

  console.log(`pack: ${dir} (${pkg.name})`);
  const files = packedFiles(dir);

  const targets = [
    ...collectExportTargets(pkg.exports),
    ...collectExportTargets(pkg.bin),
    pkg.main,
    pkg.module,
    pkg.types,
  ].filter(t => typeof t === 'string' && t.startsWith('.'));

  for (const target of new Set(targets)) {
    // Wildcard subpaths can't be checked against a static file list.
    if (target.includes('*')) continue;

    const relative = posix.normalize(target.replace(/^\.\//, ''));

    if (/\.(c|m)?tsx?$/.test(relative) && !relative.endsWith('.d.ts')) {
      console.error(
        `  ERROR ${pkg.name}: exports "${target}" points at TypeScript source. ` +
          `Node cannot strip types under node_modules — publish compiled JS instead.`
      );
      failed = true;
      continue;
    }

    if (!files.has(relative)) {
      console.error(
        `  ERROR ${pkg.name}: "${target}" is referenced by the manifest but is ` +
          `not in the tarball (check "files" and the build output).`
      );
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nPackaging verification failed.');
  process.exit(1);
}

console.log('\nPackaging verification passed.');
