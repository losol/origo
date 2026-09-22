---
"@eventuras/vite-config": minor
---

Stop emitting type declarations from the presets, so consumers can move to TypeScript 7.

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
