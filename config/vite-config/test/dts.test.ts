import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { dts } from '../src/dts.js';
import { defineReactLibConfig } from '../src/react-lib.js';
import { defineVanillaLibConfig, type VanillaLibConfig } from '../src/vanilla-lib.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'lib');
const typescriptDir = dirname(createRequire(import.meta.url).resolve('typescript/package.json'));

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'eventuras-dts-')));
  cpSync(fixture, root, { recursive: true });
  // The plugin runs the tsc installed in the package under build.
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(typescriptDir, join(root, 'node_modules', 'typescript'), 'dir');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function distFiles(): string[] {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return [];
  return readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(sep).join('/'))
    .filter((file) => /\.[a-z]+$/.test(file))
    .sort();
}

function read(file: string): string {
  return readFileSync(join(root, 'dist', file), 'utf8');
}

async function buildLibrary(overrides: Partial<VanillaLibConfig> = {}): Promise<void> {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    ...defineVanillaLibConfig({
      entry: { index: join(root, 'src/index.ts'), 'nested/deep': join(root, 'src/nested/deep.ts') },
      viteConfig: { resolve: { alias: { '@': join(root, 'src') } } },
      ...overrides,
    }),
  });
}

describe('dts', () => {
  it('emits declarations next to the JavaScript, laid out from the entry root', async () => {
    await buildLibrary();

    expect(distFiles()).toEqual([
      'greet.d.ts',
      'greet.d.ts.map',
      'index.d.ts',
      'index.d.ts.map',
      'index.js',
      'index.js.map',
      'nested/deep.d.ts',
      'nested/deep.d.ts.map',
      'nested/deep.js',
      'nested/deep.js.map',
      'types.d.ts',
      'types.d.ts.map',
    ]);
    expect(read('greet.d.ts')).toContain('/** Greets loudly. */');
  });

  it('leaves out test files, files outside the entry root and the tsconfig exclude', async () => {
    await buildLibrary();

    const files = distFiles();
    expect(files).not.toContain('greet.test.d.ts');
    expect(files).not.toContain('vite.config.d.ts');
    expect(files.some((file) => file.startsWith('src/') || file.startsWith('legacy/'))).toBe(false);
  });

  it('rewrites path aliases to relative imports', async () => {
    await buildLibrary();

    expect(read('index.d.ts')).toContain("from './greet'");
    expect(read('greet.d.ts')).toContain("from './types'");
    expect(read('nested/deep.d.ts')).toContain("from '../types'");
    for (const file of distFiles().filter((file) => file.endsWith('.d.ts'))) {
      expect(read(file)).not.toContain("'@/");
    }
  });

  it('cleans up its temporary tsconfig', async () => {
    await buildLibrary();

    expect(readdirSync(root).filter((file) => file.includes('eventuras-dts'))).toEqual([]);
  });

  it('fails the build on type errors and still cleans up', async () => {
    writeFileSync(join(root, 'src/bad.ts'), 'export const n: number = "no";\n');

    await expect(buildLibrary()).rejects.toThrow(/bad\.ts/);
    expect(readdirSync(root).filter((file) => file.includes('eventuras-dts'))).toEqual([]);
  });

  it('skips the emit with dts: false', async () => {
    await buildLibrary({ dts: false });

    expect(distFiles().some((file) => file.endsWith('.d.ts'))).toBe(false);
    expect(distFiles()).toContain('index.js');
  });

  it('emits from another tsconfig with dts.tsconfig', async () => {
    writeFileSync(
      join(root, 'tsconfig.lib.json'),
      JSON.stringify({ extends: './tsconfig.json', compilerOptions: { declarationMap: false } })
    );

    await buildLibrary({ dts: { tsconfig: 'tsconfig.lib.json' } });

    expect(distFiles()).toContain('index.d.ts');
    expect(distFiles().some((file) => file.endsWith('.d.ts.map'))).toBe(false);
  });

  it('lines declarations up with a single named entry in a subdirectory', async () => {
    await buildLibrary({ entry: { 'nested/deep': join(root, 'src/nested/deep.ts') } });

    const files = distFiles();
    expect(files).toContain('nested/deep.js');
    expect(files).toContain('nested/deep.d.ts');
    expect(files).toContain('types.d.ts');
    expect(files).not.toContain('deep.d.ts');
  });

  it('mirrors src under the React preset, which preserves modules', async () => {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      ...defineReactLibConfig({
        entry: join(root, 'src/index.ts'),
        viteConfig: { resolve: { alias: { '@': join(root, 'src') } } },
      }),
    });

    const files = distFiles();
    expect(files).toContain('index.js');
    expect(files).toContain('nested/deep.js');
    expect(files).toContain('index.d.ts');
    expect(files).toContain('nested/deep.d.ts');
    expect(read('nested/deep.d.ts')).toContain("from '../types'");
  });

  it('works on its own, outside the presets', async () => {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [dts()],
      build: {
        lib: {
          entry: { index: join(root, 'src/index.ts') },
          formats: ['es'],
          fileName: (_format, name) => `${name}.js`,
        },
      },
    });

    expect(distFiles()).toContain('index.d.ts');
    expect(distFiles()).toContain('nested/deep.d.ts');
  });
});
