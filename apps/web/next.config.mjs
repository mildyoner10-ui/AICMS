/** @type {import('next').NextConfig} */
const nextConfig = {
  // API_BASE_URL for server-side rewrites (Docker networking); public fallback for host dev.
  async rewrites() {
    const base = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${base}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
