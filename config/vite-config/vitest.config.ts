import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The fixture library carries a *.test.ts of its own, to prove the
    // declaration emit leaves it out. It is not a test of this package.
    exclude: [...configDefaults.exclude, 'test/fixtures/**'],
  },
});
