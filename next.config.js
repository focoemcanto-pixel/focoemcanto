/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Explicit public namespace avoids interference with /_next edge routes.
  assetPrefix: '/foco-assets',
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
