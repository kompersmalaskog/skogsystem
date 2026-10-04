import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Automatisk JSX-runtime som Next (annars "React is not defined" i komponenter utan React-import).
  esbuild: { jsx: 'automatic' },
  test: { globals: true },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
