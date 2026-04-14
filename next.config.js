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
    runtimeCaching: [
      {
        // Cache-first: static assets (JS, CSS, fonts, images) — rarely change
        urlPattern: /^https:\/\/.*\.(js|css|woff2?|png|jpg|svg|ico)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
        },
      },
      {
        // Network-first: API routes — falls back to cached response if offline
        urlPattern: /^https?:\/\/.*\/api\/.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 5 * 60, // 5 minutes
          },
        },
      },
      {
        // Network-first: app pages — cached copy served when offline
        urlPattern: /^https?:\/\/.*\/(?!api).*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'page-cache',
          networkTimeoutSeconds: 5,
        },
      },
    ],
  })
  module.exports = withPWA(nextConfig)
} else {
  module.exports = nextConfig
}
