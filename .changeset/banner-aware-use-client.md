---
'@eventuras/vite-config': patch
---

Skip leading banner/license comments (e.g. Rollup's `output.banner`) when checking whether a chunk already starts with a `'use client'` directive, so banner-carrying chunks no longer get a duplicate directive prepended.
