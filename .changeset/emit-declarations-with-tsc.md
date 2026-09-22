---
"@eventuras/core": patch
"@eventuras/core-nextjs": patch
"@eventuras/logger": patch
"@eventuras/app-config": patch
---

Emit type declarations with `tsc` instead of `vite-plugin-dts`. The declarations now keep
JSDoc comments and `import type`; `@eventuras/core` no longer ships an unreferenced
`useragents/patterns.json.d.ts`.
