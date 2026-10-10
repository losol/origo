---
"@eventuras/vite-config": minor
---

Emit type declarations from the presets again, with the TypeScript compiler the package already has.

0.4.0 dropped `vite-plugin-dts`, because it needs the JavaScript Compiler API that TypeScript 7 no longer ships, and asked every consumer to add `tsc --emitDeclarationOnly` to its build script. That moved four things onto each consumer: where `outDir` resolves, keeping test files out of the emit, path aliases that `tsc` leaves as `@/…`, and types that stop updating in watch mode.

The presets now run the consumer's own `tsc` as a command (so TypeScript 6 and 7 both work) after the Vite build, and:

- put the declarations in Vite's `outDir`, laid out from the library's entry root, next to the JavaScript;
- always leave out `*.test.*`, `*.spec.*`, `*.stories.*`, `__tests__` and `__mocks__`, on top of the tsconfig's own `exclude`;
- rewrite path aliases from `resolve.alias` (such as the `@/` alias the React preset sets) to relative imports in the emitted `.d.ts`;
- re-emit on every rebuild under `vite build --watch`;
- fail the build when `tsc` reports errors.

**Migrating from 0.4:** remove `&& tsc --emitDeclarationOnly` from the package's build script (and a `tsconfig.build.json` that only existed to exclude tests). `vite build` is enough again. Keep `typescript` as a devDependency: it is what emits the declarations, and is now declared as an optional peer (`>=5.5`).

**New option:** `dts` on every preset, `true` by default. `dts: false` skips the emit; `{ tsconfig, entryRoot, include, exclude }` tunes it. The plugin is also exported on its own from `@eventuras/vite-config/dts`, for configs that do not use a preset.
