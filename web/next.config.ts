import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Every page is behind a login and shows live pipeline data, so nothing is
  // prerendered or cached — classic dynamic rendering is the right model.
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ['unpdf'],
  experimental: {
    // Interview answers upload as audio; imports carry whole sheets
    serverActions: { bodySizeLimit: '10mb' },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
