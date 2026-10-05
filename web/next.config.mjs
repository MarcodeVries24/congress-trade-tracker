/** @type {import('next').NextConfig} */
const nextConfig = {
  // @congtrade/shared ships raw TypeScript rather than a build step, so Next
  // has to compile it the way it compiles this app's own files.
  transpilePackages: ["@congtrade/shared"],
  // The package lives above this directory. Vercel's project root is `web`, so
  // "Include source files outside of the Root Directory" has to be on for the
  // deployed build to see it at all.
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,
  // Old addresses, forwarded here rather than by a page: a redirect in the
  // config costs no function call. The ranking's periods moved from ?days=
  // to their own path so each can be a cached page; the query is passed
  // along and ignored there.
  // Development only: the Expo web preview (another localhost port) reading
  // the public API, which no longer passes through the middleware that
  // answers its cross-origin requests. Public answers carry no credentials,
  // so any origin will do; the routes behind the middleware keep its stricter
  // handling. Nothing is added in production.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    const cors = [{ key: "Access-Control-Allow-Origin", value: "*" }];
    return [
      { source: "/api/:path((?!account|admin|alerts|push|store|stripe|trades).*)", headers: cors },
      {
        source: "/api/trades",
        missing: [
          { type: "query", key: "members" },
          { type: "query", key: "tickers" },
          { type: "query", key: "parties" },
          { type: "query", key: "states" },
          { type: "query", key: "state" },
          { type: "query", key: "types" },
          { type: "query", key: "owners" },
          { type: "query", key: "minAmount" },
          { type: "query", key: "amountRanges" },
          { type: "query", key: "marketCapTiers" },
          { type: "query", key: "filedStatus" },
          { type: "query", key: "dateFrom" },
          { type: "query", key: "dateTo" },
          { type: "query", key: "tradedFrom" },
          { type: "query", key: "tradedTo" }
        ],
        headers: cors,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/before-disclosure", destination: "/best-trades", permanent: true },
      {
        source: "/best-trades",
        has: [{ type: "query", key: "days", value: "(?<d>30|90)" }],
        destination: "/best-trades/:d",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
