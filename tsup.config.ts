import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/Cmd.ts',
    'src/Sub.ts',
    'src/Task.ts',
    'src/Platform.ts',
    'src/Html.ts',
    'src/React.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  external: ['effect', 'react'],
})
