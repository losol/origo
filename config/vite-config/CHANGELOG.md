# @eventuras/vite-config

## 0.3.1

### Patch Changes

- 6529136: Skip leading banner/license comments (e.g. Rollup's `output.banner`) when checking whether a chunk already starts with a `'use client'` directive, so banner-carrying chunks no longer get a duplicate directive prepended.

## 0.3.0

### Minor Changes

- 3af2fb5: Publish compiled JavaScript and type declarations instead of raw TypeScript sources.

  The package mapped its export subpaths straight at `./src/*.ts`. That works inside
  the monorepo, where pnpm links the package and Node's realpath lands outside
  `node_modules` — but every consumer installing from the registry hit
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, because Node never strips types for
  files under `node_modules`. Loading any preset from a `vite.config.ts` failed
  outright, forcing consumers into per-package workarounds
  (`NODE_OPTIONS="--import tsx"`, `vite build --configLoader runner`).

  The subpaths are unchanged (`./base`, `./react-lib`, `./vanilla-lib`, `./next-lib`);
  they now resolve to `dist/*.js` with matching `dist/*.d.ts`. No import needs to
  change — consumers can drop the workarounds.

  Two latent bugs surfaced while type-checking the sources for the first time and are
  fixed here as well:

  - `useSWC: true` threw `require is not defined`. The SWC plugin was loaded with a
    bare `require()` inside an ES module; it now uses `createRequire`.
  - `dts.outDir` and `dts.rollupTypes` were silently ignored. vite-plugin-dts v5
    renamed those options to `outDirs` and `bundleTypes`. The preset's own option
    names are unchanged.

## 0.2.2

### Patch Changes

- a29b507: Stop bundling runtime dependencies into published library output, and stop minifying.

  The vanilla/react/next library presets used to inline every transitive dep (e.g. `oauth4webapi` was bundled into `@eventuras/fides-auth`) and minify class/function names. Two consequences:

  - **`instanceof` failed across module boundaries.** A consumer importing `ResponseBodyError` from `openid-client` got a different class than the one a library threw, because the library carried its own bundled+renamed copy.
  - **Stack traces were unreadable** — minified names like `j` instead of `ResponseBodyError`.

  The presets now:

  - Auto-externalize every entry in the consumer's `dependencies`, `peerDependencies`, and `optionalDependencies` (plus `node:*` built-ins).
  - Set `build.minify: false` (libraries should not minify — consumers minify their own bundle).
  - Emit sourcemaps so consumer stack traces map back to original sources.

  No API changes — all affected packages are bumped `patch`. The only observable effect is leaner, more debuggable output: deps are required at install time (already the case via each lib's `dependencies`) instead of duplicated inside the bundle.

## 0.2.1

### Patch Changes

- 7c9fe79: chore: update dependencies

## 0.2.0

### Minor Changes

### 🧱 Features

- feat(vite-config): centralize Vite configurations (6fe962c) [@eventuras/vite-config]

### 🧹 Maintenance

- chore(vite-config): update Vite configuration for Next.js compatibility (b2fa328) [@eventuras/vite-config]

## 0.1.0 (2025-10-18)

### Major Changes

- Initial release of centralized Vite configuration presets
- Added `defineVanillaLibConfig` for vanilla TypeScript libraries
- Added `defineReactLibConfig` for React component libraries
- Added `defineNextLibConfig` for Next.js-compatible libraries

### 🧱 Features

- TypeScript declaration generation with vite-plugin-dts
- Optional Tailwind CSS support
- 'use client' directive preservation for React Server Components
- Configurable module preservation
- Support for multiple entry points via glob patterns
- Automatic exclusion of test files and stories from type generation
- Choice between Babel and SWC for React transformation
