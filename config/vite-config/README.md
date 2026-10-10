# @eventuras/vite-config

Shared Vite configurations for Eventuras monorepo libraries.

## Overview

This package provides reusable Vite configuration presets for different types of libraries in the Eventuras monorepo. It helps maintain consistency, reduces duplication, and makes it easier to update build configurations across all libraries.

## Requirements

- Node.js 24+
- Vite 7 or 8 (peer dependency)
- TypeScript 5.5+ (6 or 7 recommended) in the consuming package; it emits the declarations (see below)

## Type declarations

Every preset emits `.d.ts` files as part of `vite build`. After the JavaScript
is written, the preset runs the `tsc` installed in your package with
`--emitDeclarationOnly`, reading your `tsconfig.json`. `tsc` runs as a command,
never through the Compiler API, so TypeScript 6 and 7 both work.

What you get, with no build-script changes:

- Declarations in Vite's `outDir`, laid out from the library's entry root, so
  `dist/foo/index.d.ts` sits next to `dist/foo/index.js`. The tsconfig's own
  `outDir` and `rootDir` do not matter here.
- Test, spec and story files (`*.test.*`, `*.spec.*`, `*.stories.*`,
  `__tests__/`, `__mocks__/`) are always left out, even when your tsconfig's
  `exclude` does not list them. Your own `exclude` still applies on top.
- Path aliases from `resolve.alias` (the React preset's `@/`, for instance) are
  rewritten to relative imports in the emitted files, which `tsc` does not do.
- Type errors fail the build.
- `vite build --watch` re-emits declarations on every rebuild.

Tune it with the `dts` option on any preset:

```typescript
export default defineVanillaLibConfig({
  entry: 'src/index.ts',
  dts: {
    tsconfig: 'tsconfig.lib.json', // default: tsconfig.json
    entryRoot: 'src',              // default: preserveModulesRoot, else the entries' common directory
    include: ['src'],              // replaces the tsconfig's include; default: [entryRoot]
    exclude: ['src/internal/**'],  // added to the tsconfig's exclude
  },
});
```

`dts: false` skips the emit. The plugin is also available on its own, for a
config that does not use a preset:

```typescript
import { dts } from '@eventuras/vite-config/dts';

export default defineConfig({
  plugins: [dts()],
  build: { lib: { entry: 'src/index.ts', formats: ['es'] } },
});
```

## Presets

### Vanilla Library (`vanilla-lib`)

For plain TypeScript libraries without React.

```typescript
// vite.config.ts
import { defineVanillaLibConfig } from '@eventuras/vite-config/vanilla-lib';
import { resolve } from 'path';

export default defineVanillaLibConfig({
  entry: 'src/index.ts',
  name: 'MyLibrary',
  external: ['some-external-dep'],
});
```

### React Library (`react-lib`)

For React component libraries and utilities.

```typescript
// vite.config.ts
import { defineReactLibConfig } from '@eventuras/vite-config/react-lib';
import { resolve } from 'path';

export default defineReactLibConfig({
  entry: 'src/index.ts',
  // Or use glob for multiple entry points:
  // entry: 'src/**/index.ts',
  external: ['@eventuras/ratio-ui'],
  tailwind: true, // Enable Tailwind CSS
  preserveModules: true, // Keep source structure in dist
  useSWC: false, // Use Babel (default) or SWC for React transform
});
```

**Features:**
- React plugin (Babel or SWC)
- Optional Tailwind CSS support
- 'use client' directive preservation for RSC
- Configurable module preservation
- Type declarations with `@/` imports rewritten to relative paths

### Next.js Library (`next-lib`)

For React libraries compatible with Next.js (includes Next.js externals).

```typescript
// vite.config.ts
import { defineNextLibConfig } from '@eventuras/vite-config/next-lib';
import { resolve } from 'path';

export default defineNextLibConfig({
  entry: {
    'Image/index': resolve(__dirname, 'src/Image/index.ts'),
    'Link/index': resolve(__dirname, 'src/Link/index.ts'),
    index: resolve(__dirname, 'src/index.ts'),
  },
  external: ['@eventuras/ratio-ui'],
  tailwind: true,
});
```

**Features:**
- All React library features
- Next.js externals (next, next/image, next/link, etc.)
- Always preserves 'use client' directives

## Configuration Options

### Common Options

All presets support these options:

- **`entry`**: Library entry point(s)
  - String: `'src/index.ts'`
  - Object: `{ index: 'src/index.ts', utils: 'src/utils.ts' }`
  - Glob (React only): `'src/**/index.ts'`

- **`external`**: Additional dependencies to exclude from bundle
  - Array of strings or RegExp patterns
  - Common externals (react, next) are already included

- **`dts`**: Type declaration emit (default: `true`). `false` skips it; an object
  sets `tsconfig`, `entryRoot`, `include` or `exclude` (see [Type declarations](#type-declarations))

- **`viteConfig`**: Additional Vite config to merge

### React-Specific Options

- **`tailwind`**: Enable Tailwind CSS support (default: `false`)
- **`preserveModules`**: Keep source structure in output (default: `true`)
- **`preserveUseClientDirectives`**: Preserve 'use client' for RSC (default: `true`)
- **`useSWC`**: Use SWC instead of Babel (default: `false`)

## Migration Guide

### Before (duplicated config in each library)

```typescript
// libs/my-lib/vite.config.ts
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/**/*'],
      exclude: ['src/**/*.stories.tsx'],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
```

### After (using shared config)

```typescript
// libs/my-lib/vite.config.ts
import { defineReactLibConfig } from '@eventuras/vite-config/react-lib';

export default defineReactLibConfig({
  entry: 'src/index.ts',
});
```

## Best Practices

1. **Use the most specific preset**: If building for Next.js, use `next-lib` instead of `react-lib`
2. **Only specify what's different**: The presets have sensible defaults
3. **Use glob patterns for multi-entry libraries**: `entry: 'src/**/index.ts'`
4. **Enable SWC for faster builds**: `useSWC: true` (in development)
5. **Keep modules preserved**: `preserveModules: true` for better tree-shaking

## Troubleshooting

### Types not generated
- On 0.4.x the presets did not emit declarations; upgrade to 0.5.0 or later and remove `&& tsc --emitDeclarationOnly` from the build script, since the preset now emits (and emitting twice is wasted work)
- `typescript` must be installed in the package that builds. The error names the package when it is not
- `dts: false` in the config turns the emit off

### Declarations in the wrong place, or `TS6059: File is not under 'rootDir'`
- The declaration tree starts at the entry root: `preserveModulesRoot` when set, otherwise the directory all entries share. Set `dts.entryRoot` when that guess is wrong
- Only files under the entry root are compiled (`dts.include`). A file outside it that a public export reaches, such as a shared `types/` directory, needs `dts.include: ['src', 'types']` and an `entryRoot` that contains both

### Aliased imports left in `.d.ts`
- Aliases are rewritten when their target lies inside the entry root. One that points elsewhere is left as-is with a warning; use a relative import there

### 'use client' directives missing
- Ensure `preserveUseClientDirectives: true` (default for Next.js)
- Check that source files have 'use client' at the top

### Build errors with Next.js
- Use `next-lib` preset instead of `react-lib`
- Check that Next.js packages are in `external` array

### `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`
- Upgrade to 0.3.0 or later. Versions up to 0.2.2 exported raw TypeScript sources, which Node refuses to load from `node_modules`. Workarounds such as `NODE_OPTIONS="--import tsx"` or `vite build --configLoader runner` are no longer needed and can be removed.

## Development

The published package is compiled output, not sources: `pnpm build` runs `tsc` and
emits `dist/` (ESM + declarations), and `exports` points there. Do not repoint
`exports` at `src/` — Node never strips types for files under `node_modules`, so
that breaks every consumer installing from the registry. `pnpm verify:packaging`
at the repo root checks this.

`pnpm test` builds the fixture library under `test/fixtures/lib` with the real
Vite and the real `tsc`, and checks the declarations that come out.
