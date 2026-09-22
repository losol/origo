---
"@eventuras/typescript-config": minor
---

Resolve `outDir` in `library.json`, `react-library.json` and `node.json` against the
consuming package (`${configDir}/dist`) instead of this package's own directory.

A relative `outDir` in an extended config resolves next to the file that declares it,
so `tsc` in a consuming package wrote into `node_modules/@eventuras/typescript-config/dist`
unless the package set `outDir` itself. Requires TypeScript 5.5 or later.
