/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
