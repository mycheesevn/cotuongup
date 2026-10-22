/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      // Any *.vercel.app host permanently redirects to the canonical
      // host, preserving path + query (old links keep working).
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://cotuongup.synerworlds.com/:path*",
        permanent: true,
      },
      // The blog lives on the SynerWorlds hub — permanent (308) redirects,
      // mirroring checkers/caro. No Cờ Úp guide exists on the hub yet, so
      // every local blog URL lands on the Cờ Úp category list (which
      // renders its empty state until the bilingual guides are imported
      // there). Local blog pages/content were deleted — these redirects
      // are the /blog routes now.
      {
        source: "/blog",
        destination: "https://synerworlds.com/blog?cat=co-up",
        permanent: true,
      },
      {
        source: "/blog/:slug",
        destination: "https://synerworlds.com/blog?cat=co-up",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
