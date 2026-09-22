---
"@eventuras/eslint-config": patch
---

Keep linting working in projects on TypeScript 7.

typescript-eslint 8 needs the TypeScript JavaScript Compiler API and refuses to load
when it finds TypeScript 7, which no longer ships it. The config now depends on
`@typescript/typescript6` under the name `typescript`, so typescript-eslint resolves the
TypeScript 6 API from here regardless of the TypeScript version the project compiles with.
