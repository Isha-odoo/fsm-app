import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds plain static files into ./out (Render Static Site, Capacitor/APK).
// Without it you get the normal Next.js server build.
const exporting = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
<<<<<<< HEAD
  ...(exporting ? { output: "export" as const, trailingSlash: true } : {}),
  // Cache Components / partial prefetching are not available in static export mode.
  cacheComponents: !exporting,
  partialPrefetching: !exporting,
=======
  output: 'export',
  images: {
    unoptimized: true,
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
>>>>>>> origin/main
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
