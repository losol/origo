# @eventuras/typescript-config

## 1.1.1

### Patch Changes

- c9b0d3d: Resolve `include` and `exclude` against the consuming package (`${configDir}/…`), as 1.1.0 did for `outDir`.
  
  Relative paths in an extended config resolve next to the file that declares them, so the shared `src/**/*` include pointed into this package, and a consumer without its own `include` failed with `TS18003: No inputs were found`. The test and story excludes in `base.json` had the same problem and never applied to consumers.

## 1.1.0

### Minor Changes

- 7f9e1d6: Resolve `outDir` in `library.json`, `react-library.json` and `node.json` against the
  consuming package (`${configDir}/dist`) instead of this package's own directory.
  
  A relative `outDir` in an extended config resolves next to the file that declares it,
  so `tsc` in a consuming package wrote into `node_modules/@eventuras/typescript-config/dist`
  unless the package set `outDir` itself. Requires TypeScript 5.5 or later.
