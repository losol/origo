---
'@eventuras/typescript-config': patch
---

Resolve `include` and `exclude` against the consuming package (`${configDir}/…`), as 1.1.0 did for `outDir`.

Relative paths in an extended config resolve next to the file that declares them, so the shared `src/**/*` include pointed into this package, and a consumer without its own `include` failed with `TS18003: No inputs were found`. The test and story excludes in `base.json` had the same problem and never applied to consumers.
