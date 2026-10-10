# @eventuras/vite-config

## 0.5.0

### Minor Changes

- af8bfca: Emit type declarations from the presets again, with the TypeScript compiler the package already has.
  
  0.4.0 dropped `vite-plugin-dts`, because it needs the JavaScript Compiler API that TypeScript 7 no longer ships, and asked every consumer to add `tsc --emitDeclarationOnly` to its build script. That moved four things onto each consumer: where `outDir` resolves, keeping test files out of the emit, path aliases that `tsc` leaves as `@/…`, and types that stop updating in watch mode.
  
  The presets now run the consumer's own `tsc` as a command (so TypeScript 6 and 7 both work) after the Vite build, and:
  
  - put the declarations in Vite's `outDir`, laid out from the library's entry root, next to the JavaScript;
  - always leave out `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__` and `__mocks__`, on top of the tsconfig's own `exclude`;
  - rewrite path aliases from `resolve.alias` (such as the `@/` alias the React preset sets) to relative imports in the emitted `.d.ts`;
  - re-emit on every rebuild under `vite build --watch`;
  - fail the build when `tsc` reports errors.
  
  **Migrating from 0.4:** remove `&& tsc --emitDeclarationOnly` from the package's build script (and a `tsconfig.build.json` that only existed to exclude tests). `vite build` is enough again. Keep `typescript` as a devDependency: it is what emits the declarations, and is now declared as an optional peer (`>=5.5`).
  
  **New option:** `dts` on every preset, `true` by default. `dts: false` skips the emit; `{ tsconfig, entryRoot, include, exclude }` tunes it. The plugin is also exported on its own from `@eventuras/vite-config/dts`, for configs that do not use a preset.

## 0.4.0

### Minor Changes

- 7f9e1d6: Stop emitting type declarations from the presets, so consumers can move to TypeScript 7.
  
  `defineVanillaLibConfig` and `defineReactLibConfig` (and `defineNextLibConfig` through it)
  always added `vite-plugin-dts`, which needs the TypeScript JavaScript Compiler API.
  TypeScript 7 no longer ships it, so every consumer that emits declarations failed to
  build on the upgrade (#19).
  
  The presets now build JavaScript only, and `vite-plugin-dts` is no longer a dependency.
  Emit declarations with the compiler the package already has, after the Vite build:
  
  ```json
  "build": "vite build && tsc --emitDeclarationOnly"
  ```
  
  This works on TypeScript 6 and 7. Consumers carrying `@typescript/typescript6` as a
  workaround can drop it.
  
  **Breaking:** the `dts` option (`entryRoot`, `outDir`, `rollupTypes`) is removed from
  `ReactLibConfig` and `NextLibConfig`. `tsc` does not rewrite `@/…` path aliases in emitted
  declarations; use relative imports in anything reachable from a public export.

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
