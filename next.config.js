/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
}

// next-pwa@5 uses webpack plugins to generate the service worker.
// Skip the wrapper in development (PWA is a no-op there) so Turbopack
// does not emit the "webpack configured while Turbopack is not" warning.
// Production builds use plain `next build` (webpack) where next-pwa works correctly.
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
  })
  module.exports = withPWA(nextConfig)
} else {
  module.exports = nextConfig
}
