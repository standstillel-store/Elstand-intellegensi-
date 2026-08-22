/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // This project was authored in a sandbox without npm registry access, so
    // `next build` was never run locally. Once you've run `npm run lint`
    // yourself and are happy with it, feel free to flip this back to false.
    ignoreDuringBuilds: true,
  },
  async headers() {
    // Phase 5 — fixes the exact failure mode hit while testing the landing
    // redesign: a phone browser kept serving an HTML snapshot of "/" from
    // before the redeploy, while the same URL with a random query string
    // (never in cache) correctly showed the new build. `no-cache` doesn't
    // disable caching — it tells the browser to always revalidate with the
    // server first (a cheap conditional request), so an unchanged page still
    // returns fast via 304, but a changed one is never served stale again.
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  webpack: (config, { webpack }) => {
    // @reown/appkit-adapter-wagmi's default connector set (no explicit
    // `connectors` option is passed to WagmiAdapter in lib/web3/config.ts,
    // so it falls back to the adapter's full default set) pulls in every
    // connector wagmi ships, including several this app never asked for
    // and that pull in packages that aren't installed:
    //   - @coinbase/cdp-sdk (Coinbase/Smart-Wallet connector's x402
    //     payment feature) → @x402/evm, @x402/svm, @x402/core, ...
    //   - `porto`, a separate optional wagmi connector (wagmi's own docs:
    //     "connector dependencies are now optional peer dependencies...
    //     if you want to use [porto], you also need to install the porto
    //     npm package")
    //   - Tempo Wallet connector (@wagmi/core/dist/esm/tempo/) →
    //     @metamask/connect-evm, plus a bare `'accounts'` import that
    //     looks like a broken internal/workspace reference in whichever
    //     @wagmi/core version resolved here (not a real installable
    //     package at all — "tempoWallet is a thin Wagmi wrapper around
    //     the accounts dialog adapter" per wagmi's own docs, so this is
    //     almost certainly a packaging bug in that connector's published
    //     build, not something anyone should `npm install`).
    // None of MetaMask/Rabby/OKX/Coinbase/WalletConnect — the actual
    // wallet list this app supports — are affected; those are auto-
    // detected via EIP-6963 or use WalletConnect directly, neither of
    // which touches any of the modules below.
    //
    // `'accounts'` on its own is too generic a name to ignore everywhere
    // (a real unrelated package could plausibly share that name elsewhere
    // in the tree) — contextRegExp scopes that specific ignore to only
    // requests coming from @wagmi/core's tempo directory, not a blanket
    // ignore of anything called 'accounts' anywhere in the build.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402\/|porto(\/|$)|@metamask\/connect-evm)/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^accounts$/,
        contextRegExp: /@wagmi[\\/]core[\\/]dist[\\/]esm[\\/]tempo/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
