---
"@eventuras/vite-config": minor
---

Publish compiled JavaScript and type declarations instead of raw TypeScript sources.

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
