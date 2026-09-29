/** @type {import('next').NextConfig} */
const nextConfig = {
  // @congtrade/shared ships raw TypeScript rather than a build step, so Next
  // has to compile it the way it compiles this app's own files.
  transpilePackages: ["@congtrade/shared"],
  // The package lives above this directory. Vercel's project root is `web`, so
  // "Include source files outside of the Root Directory" has to be on for the
  // deployed build to see it at all.
  outputFileTracingRoot: new URL("..", import.meta.url).pathname,
};

export default nextConfig;
