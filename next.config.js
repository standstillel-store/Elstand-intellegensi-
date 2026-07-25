/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // This project was authored in a sandbox without npm registry access, so
    // `next build` was never run locally. Once you've run `npm run lint`
    // yourself and are happy with it, feel free to flip this back to false.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
