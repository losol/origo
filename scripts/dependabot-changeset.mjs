#!/usr/bin/env node
/**
 * Writes changesets for a Dependabot pull request.
 *
 * Dependabot PRs carry no changeset, so a bump to a published package's
 * dependencies would be merged but never released. For every public package
 * under config/ and packages/ whose `dependencies`, `optionalDependencies` or
 * `peerDependencies` differ from the merge base, this writes a patch changeset
 * listing the changed ranges. devDependency and lockfile-only bumps never
 * reach consumers, so they get none.
 *
 * Files are named after the PR branch, so re-running after Dependabot rebases
 * or updates the PR rewrites them instead of piling up duplicates, and removes
 * those that no longer apply.
 *
 * Env: BASE_SHA (the PR's base commit), HEAD_REF (the PR branch).
 */

import { execFileSync } from 'node:child_process';
import { globSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const PACKAGE_GLOBS = ['config/*/package.json', 'packages/*/package.json'];

/** Manifest fields that reach consumers, with the label used in the summary. */
const FIELDS = [
  ['dependencies', ''],
  ['optionalDependencies', 'optional '],
  ['peerDependencies', 'peer '],
];

const { BASE_SHA, HEAD_REF } = process.env;
if (!BASE_SHA || !HEAD_REF) {
  console.error('BASE_SHA and HEAD_REF must be set.');
  process.exit(1);
}

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const mergeBase = git('merge-base', 'HEAD', BASE_SHA).trim();
const prefix = `dependabot-${HEAD_REF.replace(/^dependabot\//, '').replace(/[^a-zA-Z0-9-]+/g, '-')}`;

/** The manifest as it was at the merge base, or null for a new package. */
function baseManifest(path) {
  try {
    return JSON.parse(git('show', `${mergeBase}:${path}`));
  } catch {
    return null;
  }
}

const formatRange = range => (range === undefined ? '_(none)_' : `\`${range}\``);

function changedRanges(before, after) {
  const changes = [];
  for (const [field, label] of FIELDS) {
    const from = before[field] ?? {};
    const to = after[field] ?? {};
    const names = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();
    for (const name of names) {
      if (from[name] === to[name]) continue;
      changes.push({
        peer: field === 'peerDependencies',
        line: `- ${label}\`${name}\`: ${formatRange(from[name])} → ${formatRange(to[name])}`,
      });
    }
  }
  return changes;
}

const manifests = PACKAGE_GLOBS.flatMap(pattern => globSync(pattern)).sort();
const written = new Set();

for (const manifest of manifests) {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  if (pkg.private === true) continue;

  const before = baseManifest(manifest);
  if (!before) continue;

  const changes = changedRanges(before, pkg);
  if (changes.length === 0) continue;

  // A narrowed peer range drops support for versions consumers may be on,
  // which a patch release understates. Flag it rather than guess the level.
  if (changes.some(change => change.peer)) {
    console.log(
      `::warning file=${manifest}::peerDependencies changed for ${pkg.name}; ` +
        'the changeset is a patch — raise it by hand if the new range drops support.',
    );
  }

  const file = `.changeset/${prefix}-${basename(dirname(manifest))}.md`;
  const body = changes.map(change => change.line).join('\n');
  writeFileSync(file, `---\n'${pkg.name}': patch\n---\n\nUpdate dependencies:\n\n${body}\n`);
  written.add(file);
  console.log(`wrote ${file}`);
}

for (const file of globSync(`.changeset/${prefix}-*.md`)) {
  if (written.has(file)) continue;
  rmSync(file);
  console.log(`removed ${file}`);
}
