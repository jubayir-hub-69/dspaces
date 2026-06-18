/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors (useful for third-party package errors).
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore eslint errors during build
    ignoreDuringBuilds: true,
  }
};

export default nextConfig;
