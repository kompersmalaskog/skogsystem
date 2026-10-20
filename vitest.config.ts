import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Automatisk JSX-runtime som Next (annars "React is not defined" i komponenter utan React-import).
  esbuild: { jsx: 'automatic' },
  // vitest.setup.ts: vakten som fäller ett test som når den RIKTIGA Supabase-klienten (lib/testStod/supabaseVakt.ts).
  test: { globals: true, setupFiles: ['./vitest.setup.ts'] },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
