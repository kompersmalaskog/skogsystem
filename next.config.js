// Kopiera pdf.js-workern till /public som en DEL AV BYGGET (körs när Next laddar
// den här configen, före kompilering — ingen separat prebuild-cp som kan bryta
// build-kedjan). BÄST-EFFORT: allt ligger i try/catch och kastar ALDRIG. En
// saknad eller oåtkomlig worker ger en trasig PDF-läsare (PdfLasare visar "kunde
// inte läsa"), ALDRIG en död app. En hjälpfunktion ska aldrig kunna sänka hela
// systemet — den isoleras här.
function kopieraPdfWorker() {
  try {
    const fs = require('fs');
    const path = require('path');
    const { createRequire } = require('module');
    const req = createRequire(__filename);
    const kalla = req.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    const malDir = path.join(__dirname, 'public');
    fs.mkdirSync(malDir, { recursive: true });
    fs.copyFileSync(kalla, path.join(malDir, 'pdf.worker.min.mjs'));
    console.log('[next.config] pdf.js-worker kopierad till /public/pdf.worker.min.mjs');
  } catch (e) {
    console.warn(
      '[next.config] VARNING: kunde inte kopiera pdf.js-worker — PDF-läsaren blir ' +
      'otillgänglig, men appen byggs och fungerar i övrigt:', e && e.message
    );
  }
}
kopieraPdfWorker();

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    // Bakas in i klient-bundlen vid build. Vercel sätter VERCEL_GIT_COMMIT_SHA per deploy;
    // /api/version läser SAMMA env i runtime. Skiljer de sig → klienten kör ett äldre bygge
    // än det utrollade → visa "Ny version". Lokalt (ingen Vercel-env) → 'dev', ingen banner.
    NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },
  outputFileTracingExcludes: {
    '*': [
      'maplibre-gl/**',
      'sharp/**',
    ],
  },
  // Debug-endpoint /api/source läser in källkodsfiler från disken. På Vercel
  // bundlas annars bara import-spårade filer med funktionen — komponent-tsx
  // och STATUS.md skulle saknas i runtime-filträdet utan dessa hints.
  outputFileTracingIncludes: {
    'app/api/source/route': [
      './components/**/*.tsx',
      './app/api/**/*.ts',
      './STATUS.md',
      './CLAUDE.md',
    ],
  },
  // Kalibrerings-API:erna serverar live förar-/maskindata. Next:s default för
  // force-dynamic-routes är "Cache-Control: public, max-age=0, must-revalidate"
  // — 'public' låter webbläsare/Vercel-CDN lagra svaret, vilket serverade en
  // förare 10 h gammal 90-dagarsfönster trots färsk data i DB. no-store förbjuder
  // ALL cachning i alla lager. Ett ställe → gäller alla /api/kalibrering/*.
  async headers() {
    return [
      {
        source: '/api/kalibrering/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' }],
      },
    ];
  },
}

module.exports = nextConfig
