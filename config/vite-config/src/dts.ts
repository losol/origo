import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Alias, Plugin, ResolvedConfig } from 'vite';

/** Options for {@link dts}. Paths and globs are relative to the Vite root. */
export interface DtsOptions {
  /**
   * The tsconfig to emit from.
   * @default 'tsconfig.json'
   */
  tsconfig?: string;

  /**
   * Directory the declarations mirror (tsc's `rootDir`):
   * `<entryRoot>/a/b.ts` becomes `<outDir>/a/b.d.ts`, next to `<outDir>/a/b.js`.
   * @default `preserveModulesRoot` when set, otherwise the common directory of the library entries
   */
  entryRoot?: string;

  /**
   * Globs to compile. Replaces the tsconfig's `include`, so files the tsconfig
   * lists for the editor's sake (a `vite.config.ts`, say) stay out of `dist`.
   * @default [entryRoot]
   */
  include?: string[];

  /**
   * Globs to leave out, on top of the tsconfig's own `exclude`. Test, spec,
   * story, `__tests__` and `__mocks__` files are always left out.
   */
  exclude?: string[];
}

const PLUGIN_NAME = 'eventuras:dts';
const ALWAYS_EXCLUDED = ['**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/__tests__/**', '**/__mocks__/**'];
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
/** Module specifiers in a declaration file: `from '…'`, `import('…')`, `import '…'`, `require('…')`. */
const SPECIFIER = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"]))([^'"\n]+)\2/g;

/**
 * Emits type declarations after a Vite library build, with the TypeScript
 * compiler installed in the package.
 *
 * `tsc` is run as a command (`--emitDeclarationOnly`), never through the
 * Compiler API, so TypeScript 6 and 7 both work. The declarations land in
 * Vite's `outDir`, laid out from the entry root so each `.d.ts` sits next to
 * its `.js`. Test files are always left out, and path aliases from
 * `resolve.alias` are rewritten to relative imports, which `tsc` does not do.
 *
 * Type errors fail the build. Under `vite build --watch`, declarations are
 * re-emitted on every rebuild.
 */
export function dts(options: DtsOptions = {}): Plugin {
  let config: ResolvedConfig;
  let emitted = false;

  return {
    name: PLUGIN_NAME,
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    buildStart() {
      emitted = false;
    },
    async closeBundle() {
      if (emitted || !config.build.write) return;
      emitted = true;
      await emitDeclarations(config, options);
    },
  };
}

/** Runs the declaration emit for a resolved Vite config. Exposed for tests and custom plugins. */
export async function emitDeclarations(config: ResolvedConfig, options: DtsOptions = {}): Promise<void> {
  // tsc compares the real paths of imported files against `rootDir`, so a
  // root reached through a symlink (macOS's /var -> /private/var, say) must
  // be spelled the way tsc will spell it.
  const root = realpath(config.root);
  const outDir = realpath(resolve(root, config.build.outDir));
  const tsconfigPath = resolve(root, options.tsconfig ?? 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    throw new Error(
      `[${PLUGIN_NAME}] ${relative(root, tsconfigPath)} not found. Point \`dts.tsconfig\` at the package's tsconfig, or set \`dts: false\`.`
    );
  }

  const tsc = resolveTsc(root);
  const entryRoot = realpath(resolve(root, options.entryRoot ?? defaultEntryRoot(config)));
  const base = await readResolvedTsconfig(tsc, tsconfigPath, root);

  // A throwaway tsconfig next to the real one: `extends` keeps every option
  // (and `${configDir}`) of the package's own config, while the overrides make
  // the emit land in Vite's outDir with the right layout and without tests.
  const tempPath = join(dirname(tsconfigPath), `tsconfig.eventuras-dts.${process.pid}.json`);
  const tempConfig = {
    extends: `./${basename(tsconfigPath)}`,
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      noEmit: false,
      rootDir: entryRoot,
      outDir,
      declarationDir: outDir,
      // Keep .tsbuildinfo out of dist. Composite projects cannot turn it off.
      ...(base.compilerOptions?.composite ? {} : { incremental: false }),
    },
    include: (options.include ?? [entryRoot]).map((pattern) => resolve(root, pattern)),
    exclude: [
      ...(base.exclude ?? []),
      '**/node_modules/**',
      outDir,
      ...ALWAYS_EXCLUDED.map((pattern) => resolve(root, pattern)),
      ...(options.exclude ?? []).map((pattern) => resolve(root, pattern)),
    ],
  };

  writeFileSync(tempPath, JSON.stringify(tempConfig, null, 2));
  try {
    const result = await runTsc(tsc, ['-p', tempPath, ...(process.stdout.isTTY ? ['--pretty'] : [])], root);
    if (result.code !== 0) {
      throw new Error(
        `[${PLUGIN_NAME}] tsc exited with code ${result.code} while emitting declarations from ${relative(root, tsconfigPath)}.\n${result.output}`
      );
    }
  } finally {
    rmSync(tempPath, { force: true });
  }

  const files = declarationFiles(outDir);
  rewriteAliases(config, files, outDir, entryRoot);
  config.logger.info(`[${PLUGIN_NAME}] emitted ${files.length} declaration files to ${relative(root, outDir) || '.'}`);
}

interface ResolvedTsconfig {
  compilerOptions?: { composite?: boolean };
  exclude?: string[];
}

/** The package's tsconfig as tsc sees it, with `extends` and `${configDir}` already applied. */
async function readResolvedTsconfig(tsc: string, tsconfigPath: string, cwd: string): Promise<ResolvedTsconfig> {
  const result = await runTsc(tsc, ['-p', tsconfigPath, '--showConfig'], cwd);
  if (result.code !== 0) {
    throw new Error(`[${PLUGIN_NAME}] tsc could not read ${tsconfigPath}:\n${result.output}`);
  }
  return JSON.parse(result.output) as ResolvedTsconfig;
}

function resolveTsc(root: string): string {
  const requireFromRoot = createRequire(join(root, 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = requireFromRoot.resolve('typescript/package.json');
  } catch {
    throw new Error(
      `[${PLUGIN_NAME}] typescript is not installed in ${root}. Add it as a devDependency (it emits the declarations), or set \`dts: false\`.`
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { bin?: string | Record<string, string> };
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.tsc;
  if (!bin) {
    throw new Error(`[${PLUGIN_NAME}] the typescript package at ${dirname(manifestPath)} has no tsc binary.`);
  }
  return join(dirname(manifestPath), bin);
}

function runTsc(tsc: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [tsc, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? 1, output }));
  });
}

/**
 * Where the declaration tree starts, so that `.d.ts` files line up with the
 * `.js` files Vite writes:
 *
 * 1. `preserveModulesRoot`, when the build preserves modules;
 * 2. for named entries, the directory the names are relative to — an entry
 *    `'actions/index': 'src/actions/index.ts'` is written to
 *    `dist/actions/index.js`, so its declarations must start from `src`;
 * 3. otherwise the directory shared by all entries.
 */
function defaultEntryRoot(config: ResolvedConfig): string {
  const output = config.build.rolldownOptions?.output ?? config.build.rollupOptions?.output;
  const first = Array.isArray(output) ? output[0] : output;
  const preserveModulesRoot = (first as { preserveModulesRoot?: string } | undefined)?.preserveModulesRoot;
  if (preserveModulesRoot) return preserveModulesRoot;

  const entry = config.build.lib ? config.build.lib.entry : undefined;
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const named = rootOfNamedEntries(config.root, entry);
    if (named) return named;
  }

  const entries =
    typeof entry === 'string' ? [entry] : Array.isArray(entry) ? entry : entry ? Object.values(entry) : [];
  if (entries.length === 0) {
    return existsSync(resolve(config.root, 'src')) ? 'src' : '.';
  }
  return commonDirectory(entries.map((file) => dirname(resolve(config.root, file))));
}

/** The one directory every entry name is relative to, or undefined when the names do not line up with the files. */
function rootOfNamedEntries(root: string, entries: Record<string, string>): string | undefined {
  const roots = new Set<string>();
  for (const [name, file] of Object.entries(entries)) {
    const stem = resolve(root, file).replace(/\.[cm]?[jt]sx?$/, '');
    const suffix = sep + name.split('/').join(sep);
    if (!stem.endsWith(suffix)) return undefined;
    roots.add(stem.slice(0, -suffix.length));
  }
  const [only] = roots;
  return roots.size === 1 ? only : undefined;
}

function commonDirectory(directories: string[]): string {
  const [first = [], ...rest] = directories.map((directory) => directory.split(sep));
  let common = first;
  for (const parts of rest) {
    let length = 0;
    while (length < common.length && length < parts.length && common[length] === parts[length]) length++;
    common = common.slice(0, length);
  }
  return common.join(sep) || sep;
}

function declarationFiles(outDir: string): string[] {
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => DECLARATION_FILE.test(file))
    .map((file) => join(outDir, file))
    .sort();
}

/**
 * `tsc` leaves path aliases (`@/x`) as they are in declarations, where nothing
 * resolves them. Rewrite the ones that point into the entry root to relative
 * imports, the same way Vite resolved them for the JavaScript.
 */
function rewriteAliases(config: ResolvedConfig, files: string[], outDir: string, entryRoot: string): void {
  const stringAliases = config.resolve.alias.filter(
    (alias): alias is Alias & { find: string } => typeof alias.find === 'string'
  );
  if (stringAliases.length === 0) return;

  const rewritable = stringAliases
    .filter((alias) => isAbsolute(alias.replacement))
    .map((alias) => ({ ...alias, replacement: realpath(alias.replacement) }))
    .filter((alias) => isInside(entryRoot, alias.replacement));
  const unresolvable = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rewritten = source.replace(SPECIFIER, (match, prefix: string, quote: string, specifier: string) => {
      const matches = (alias: Alias & { find: string }) =>
        specifier === alias.find || specifier.startsWith(`${alias.find}/`);
      const alias = rewritable.find(matches);
      if (!alias) {
        if (stringAliases.some(matches)) unresolvable.add(specifier);
        return match;
      }
      const target = join(outDir, relative(entryRoot, alias.replacement), specifier.slice(alias.find.length));
      const relativeSpecifier = relative(dirname(file), target).split(sep).join('/');
      return `${prefix}${relativeSpecifier.startsWith('.') ? relativeSpecifier : `./${relativeSpecifier}`}${quote}`;
    });
    if (rewritten !== source) writeFileSync(file, rewritten);
  }

  if (unresolvable.size > 0) {
    config.logger.warn(
      `[${PLUGIN_NAME}] these aliased imports point outside the entry root and are left as-is in the declarations, where nothing resolves them: ${[...unresolvable].join(', ')}`
    );
  }
}

/** The real path when it exists, else the path as given. */
function realpath(path: string): string {
  return existsSync(path) ? realpathSync(path) : path;
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}
