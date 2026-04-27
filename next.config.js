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
      'cesium/**',
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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Cesium laddas från CDN runtime (window.Cesium) — webpack ska EJ bundla den.
      // Typer kvar via npm-paketet 'cesium' (devDep).
      config.externals = config.externals || []
      config.externals.push({ cesium: 'Cesium' })
      config.module.unknownContextCritical = false
    }
    return config
  },
}

module.exports = nextConfig
