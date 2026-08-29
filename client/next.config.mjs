import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001",
  },
  // The vendored `@devdigest/shared` contracts use `.js` specifiers in their relative
  // imports (required for the server's Node-ESM build). tsc and vitest resolve those to
  // the `.ts` sources; webpack does not by default. Every existing client import of the
  // barrel is `import type` (erased), so this never mattered — until the eval feature
  // value-imported a Zod schema (`EvalExpectedOutput`), pulling the barrel's `.js`
  // re-exports into the runtime graph. Teach webpack the same `.js`→`.ts` resolution.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
