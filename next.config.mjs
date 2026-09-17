/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverComponentsExternalPackages: [
      "@dtelecom/server-sdk-node",
      "@dtelecom/agents-js",
      "@discordjs/opus",
      "opusscript",
      "werift",
      "ws",
    ],
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors (useful for third-party package errors).
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore eslint errors during build
    ignoreDuringBuilds: false,
  },
  transpilePackages: [
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
    "@solana/wallet-adapter-phantom",
    "@solana/wallet-adapter-solflare",
    "@solana/wallet-adapter-backpack",
    "@solana/wallet-standard-features",
    "@solana/wallet-standard-util",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        os: false,
        path: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        ws: false,
      };
    }
    return config;
  },
};

export default nextConfig;