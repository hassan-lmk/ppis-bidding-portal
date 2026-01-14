/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  outputFileTracingRoot: require('path').join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ppisapi.lmkr.com',
        pathname: '/storage/**',
      },
      {
        protocol: 'http',
        hostname: 'ppisapi.lmkr.com',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    unoptimized: false,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
  },
  compress: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        buffer: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
