import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Type errors fail the build. Strict mode is non-negotiable for AVIR.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async redirects() {
    return [
      // Phase 2.5 IA: Aircraft merged into Fleet's List view. Exact match only,
      // so /aircraft/[id] (the Aircraft Profile) is untouched.
      {
        source: "/aircraft",
        destination: "/fleet?view=list",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // Phase 14: the public AVIR Index landing. `/index` collides with Next's
      // root normalization, so the page lives at /avir-index and `/index` (and
      // the intended avir.space/index) rewrites to it.
      { source: "/index", destination: "/avir-index" },
    ];
  },
};

export default nextConfig;
