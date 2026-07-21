# Origo

Shared foundation for the Eventuras ecosystem — the reference point everything
else is measured from.

Packages keep the `@eventuras/*` scope they are already published under; only
their home moved here.

## Contents

### `config/` — build and lint presets

| Package | Purpose |
| --- | --- |
| `@eventuras/eslint-config` | ESLint presets (`base`, `next-js`, `react-library`) plus custom rules |
| `@eventuras/typescript-config` | `tsconfig` bases (`base`, `library`, `react-library`, `nextjs`, `node`) |
| `@eventuras/vite-config` | Vite library presets (`base`, `react-lib`, `vanilla-lib`, `next-lib`) |

### `packages/` — runtime utilities

Planned: `logger`, `core`, `core-nextjs`, `app-config`.

## Why this repo exists

These packages are consumed by several repositories — `eventuras`, `ratio-ui`,
`fides-auth`, `lectio-docs` and (soon) `historia` — and are owned by none of
them. Keeping them in a product monorepo meant every other repo had to fork or
inline them: `ratio-ui` carries `@ratio-ui/*` copies at identical version
numbers, and `lectio-docs` inlined its Vite config.

The root cause was that `@eventuras/vite-config` was never published, so any
repo needing the Vite preset had to copy it — and once you copy one config you
copy them all. Publishing the whole set from a neutral home fixes that.

## Releases

Managed with [changesets](https://github.com/changesets/changesets). Add a
changeset with `pnpm changeset`, then release with `pnpm release`.
