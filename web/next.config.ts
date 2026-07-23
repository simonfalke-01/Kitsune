import type { NextConfig } from 'next';

const apiOrigin = process.env.KITSUNE_API_ORIGIN ?? 'http://127.0.0.1:3000';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'dev.vortq.com'],
  poweredByHeader: false,
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  rewrites() {
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`
      },
      {
        source: '/oauth/:path*',
        destination: `${apiOrigin}/oauth/:path*`
      },
      {
        source: '/health',
        destination: `${apiOrigin}/health`
      },
      {
        source: '/ready',
        destination: `${apiOrigin}/ready`
      }
    ]);
  }
};

export default nextConfig;
