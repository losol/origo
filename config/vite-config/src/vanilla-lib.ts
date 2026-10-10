import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'node:path';

import { dts as emitDeclarations, type DtsOptions } from './dts.js';
import { getRuntimeDependencyExternals, NODE_BUILTINS_EXTERNAL } from './externals.js';

export interface VanillaLibConfig {
  /**
   * Library entry point(s). Can be a string or an object with multiple entries.
   * @example 'src/index.ts'
   * @example { index: 'src/index.ts', utils: 'src/utils.ts' }
   */
  entry: string | Record<string, string>;

  /**
   * Library name for UMD builds (optional).
   */
  name?: string;

  /**
   * Additional external dependencies to exclude from the bundle, on top of the
   * runtime deps read from the consumer's package.json. Pass `false` to opt out
   * of the package.json auto-externalization (rarely what you want).
   */
  external?: (string | RegExp)[] | false;

  /**
   * Type declarations. After the JavaScript build, the package's own `tsc`
   * emits `.d.ts` files into `outDir`, next to the `.js`, with test files
   * left out and path aliases rewritten. Pass `false` to skip, or options to
   * pick the tsconfig, entry root, include or exclude.
   * @default true
   */
  dts?: boolean | DtsOptions;

  /**
   * Additional Vite configuration to merge.
   */
  viteConfig?: UserConfig;
}

/**
 * Vite configuration preset for vanilla TypeScript libraries.
 *
 * Defaults that matter for libraries:
 * - All runtime deps (dependencies + peerDependencies + optionalDependencies)
 *   are externalized so consumers get one copy from their node_modules instead
 *   of inlined+mangled copies inside the published bundle.
 * - Minification is OFF — consumers minify their own bundle, and unminified
 *   output preserves class names (so `instanceof` and stack traces work).
 * - Sourcemaps ON for debuggable consumer stack traces.
 * - Type declarations emitted by the package's own `tsc` (see `dts`).
 */
export function defineVanillaLibConfig(config: VanillaLibConfig): UserConfig {
  const { entry, name, external, dts = true, viteConfig = {} } = config;

  const autoExternals =
    external === false ? [] : getRuntimeDependencyExternals();
  const userExternals = Array.isArray(external) ? external : [];

  return defineConfig({
    plugins: [
      ...(viteConfig.plugins || []),
      ...(dts === false ? [] : [emitDeclarations(dts === true ? {} : dts)]),
    ],
    build: {
      minify: false,
      sourcemap: true,
      lib: {
        entry: typeof entry === 'string' ? resolve(process.cwd(), entry) : entry,
        ...(name && { name }),
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
      rollupOptions: {
        ...viteConfig.build?.rollupOptions,
        external: [...autoExternals, ...NODE_BUILTINS_EXTERNAL, ...userExternals],
        output: {
          preserveModules: false,
          ...viteConfig.build?.rollupOptions?.output,
        },
      },
      // Spread other build options from viteConfig except lib and rollupOptions
      ...Object.fromEntries(
        Object.entries(viteConfig.build || {}).filter(
          ([key]) => key !== 'lib' && key !== 'rollupOptions'
        )
      ),
    },
    // Spread other viteConfig options except build and plugins
    ...Object.fromEntries(
      Object.entries(viteConfig).filter(
        ([key]) => key !== 'build' && key !== 'plugins'
      )
    ),
  });
}
