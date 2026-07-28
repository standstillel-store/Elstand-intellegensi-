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
    // @reown/appkit-adapter-wagmi's default connector set pulls in
    // @coinbase/cdp-sdk (for its Coinbase/Smart-Wallet connector) and
    // @wagmi/connectors' optional `porto` connector — neither is something
    // this app configured or calls (check web3/config.ts: the wallet list
    // here is MetaMask/Rabby/OKX/Coinbase/WalletConnect via AppKit's own
    // modal, not a direct dependency on either package). Both are
    // legitimately optional:
    //   - cdp-sdk's x402 payment feature has several chain-specific
    //     optional sub-clients (@x402/evm, @x402/svm, @x402/core, ...) —
    //     Webpack still tries to resolve whichever ones cdp-sdk's own code
    //     references, and fails hard since none are installed. First build
    //     surfaced @x402/svm and @x402/evm; a second build (after ignoring
    //     those two) surfaced @x402/core next — same subtree, Webpack just
    //     hadn't reached it yet in the first pass. This ignores the whole
    //     @x402 scope up front instead of the next leaf showing up on a
    //     third build.
    //   - `porto` is a separate optional wagmi connector (wagmi's own
    //     docs: "connector dependencies are now optional peer
    //     dependencies... if you want to use [porto], you also need to
    //     install the porto npm package") — not configured here at all.
    // Safe specifically because no code path this app actually exercises
    // imports from either at runtime; this only tells Webpack not to
    // chase these two unused optional branches while bundling.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402\/|porto(\/|$))/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
