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
      './data/**',
      './data/slu-skogskarta/**',
      './data/terrain-tmp/**',
      './public/terrain-tiles/**',
    ],
  },
}

module.exports = nextConfig
