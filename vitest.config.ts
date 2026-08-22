import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

const src = path.resolve(__dirname, 'src')

export default defineConfig({
  // Documentation examples import `tea-effect/X`, exactly as a reader would.
  // Map those onto the local source so the examples in the Testing guide are
  // executed by `npm test` rather than merely typechecked.
  resolve: {
    alias: [
      { find: /^tea-effect\/(.*)$/, replacement: path.join(src, '$1') },
      { find: /^tea-effect$/, replacement: path.join(src, 'index.ts') }
    ]
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'docs/examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts']
    }
  }
})
