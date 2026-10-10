import { defineConfig } from 'vitest/config';

/**
 * Kept apart from the Vite config rather than folded into it.
 *
 * Vite's own config type does not know about `test`, so putting it there type
 * checks as an error while working perfectly — which is the worst of both, and
 * exactly the kind of thing that trains people to ignore a red build.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    /**
     * Two files at a time, not one per core.
     *
     * Each of the back-end test files brings up its own Postgres — the real
     * engine, compiled to WebAssembly — and that is tens of megabytes outside the
     * JavaScript heap. Five of them at once, with a PNG decoder alongside, and a
     * worker dies of "external memory pressure": a failure that says nothing about
     * the code and does not happen twice in the same place.
     *
     * Two at a time is still most of the parallelism and it fits.
     */
    maxWorkers: 2,
    minWorkers: 1,
    server: {
      deps: {
        /**
         * Read through Vite rather than handed to Node. molangjs says it is an ES
         * module and points Node at its CommonJS build, which Node then refuses; Vite
         * takes its `module` field instead, which is what the site itself is built
         * from.
         */
        inline: ['molangjs'],
      },
    },
  },
});
