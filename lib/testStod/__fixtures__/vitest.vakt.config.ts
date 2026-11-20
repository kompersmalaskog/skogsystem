// Underkörningens konfiguration för supabaseVakt.test.ts: SAMMA setup som sviten, men bara fixturen.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { globals: true, setupFiles: [path.resolve(__dirname, '../../../vitest.setup.ts')], include: [path.resolve(__dirname, 'vaktNarKlienten.fixtur.ts')], root: path.resolve(__dirname, '../../..') },
  resolve: { alias: { '@': path.resolve(__dirname, '../../..') } },
});
