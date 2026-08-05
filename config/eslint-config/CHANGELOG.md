# @eventuras/eslint-config

## 1.0.4

### Patch Changes

- c121e46: Republish with runtime packages declared as `dependencies`. The npm 1.0.3 tarball was published from the eventuras monorepo with everything in `devDependencies`, so consumers under pnpm's strict isolation fail to resolve `@eslint/js` and the other plugins at lint time. The corrected manifest has been sitting unpublished in this repo because the version was never bumped past the already-published 1.0.3.

## 1.0.3

### Patch Changes

- 7c9fe79: chore: update dependencies

## 1.0.2

### Patch Changes

- chore: update deps

## 1.0.1

### Patch Changes

- chore: update dependencies across frontend packages
