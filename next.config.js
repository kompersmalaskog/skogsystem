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
      './app/ForestBackground.tsx',
      'maplibre-gl/**',
      'sharp/**',
    ],
  },
}

module.exports = nextConfig
