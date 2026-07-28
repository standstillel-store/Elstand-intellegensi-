/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // This project was authored in a sandbox without npm registry access, so
    // `next build` was never run locally. Once you've run `npm run lint`
    // yourself and are happy with it, feel free to flip this back to false.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { webpack }) => {
    // @reown/appkit-adapter-wagmi transitively pulls in @coinbase/cdp-sdk
    // (not a direct dependency of this project — check with
    // `npm ls @coinbase/cdp-sdk` if you want to see exactly which package
    // requires it). cdp-sdk treats @x402/svm and @x402/evm as optional
    // peer dependencies for its x402 payment feature, which nothing in
    // this codebase calls. Webpack still tries to resolve them at bundle
    // time and fails the build since they're not installed
    // ("Module not found: Can't resolve '@x402/svm/exact/client'" /
    // "...'@x402/evm'"). IgnorePlugin tells webpack these two are safe to
    // skip instead of erroring — this only affects the bundling step, and
    // is safe specifically because no code path this app actually
    // exercises imports from them at runtime.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\/(svm|evm)/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
