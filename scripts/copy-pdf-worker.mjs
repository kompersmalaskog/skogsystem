// Kopierar pdf.js-workern till /public så den serveras SAME-ORIGIN (funkar i
// PWA-standalone på iPhone). Körs i prebuild/predev/vercel-build — versionen
// följer alltid installerad pdfjs-dist, ingen manuell synk, ingen CDN.
// require.resolve hittar workern oavsett var node_modules ligger (delad
// parent-node_modules i git-worktree lokalt, lokal på Vercel).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let kalla;
try {
  kalla = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
} catch {
  console.error('[copy-pdf-worker] hittar inte pdfjs-dist/legacy/build/pdf.worker.min.mjs — är pdfjs-dist installerad?');
  process.exit(1);
}

const malDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const mal = join(malDir, 'pdf.worker.min.mjs');
mkdirSync(malDir, { recursive: true });
copyFileSync(kalla, mal);
console.log('[copy-pdf-worker] kopierade pdf.js-worker →', mal);
