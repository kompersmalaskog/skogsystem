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
}

module.exports = nextConfig
