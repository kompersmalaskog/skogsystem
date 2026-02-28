/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  outputFileTracingExcludes: {
    '*': ['./data/**', './public/terrain-tiles/**'],
    '/planering': ['./node_modules/@maplibre/**', './node_modules/maplibre-gl/**'],
  },
  experimental: {
    outputFileTracingIgnores: ['./data/**', './public/terrain-tiles/**'],
  },
}

module.exports = nextConfig
