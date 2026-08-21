/** @type {import('next').NextConfig} */

// Static generation runs in parallel worker processes, one per CPU. On a machine already
// short of physical memory that is the first thing to fail: V8 cannot get pages for a new
// worker and aborts with "Zone Allocation failed" while the JS heap is still nearly empty.
// LOWMEM=1 serialises it. Cloud builds leave it unset and stay parallel.
const lowmem = process.env.LOWMEM === "1";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // CSVs are read off disk at request time. sessions.csv is a training input only and is
    // 11 MB, so excluding it keeps each serverless function small.
    outputFileTracingIncludes: {
      "/api/**": ["./data/*_daily.csv", "./data/ticket_products.csv", "./ml/models/**"],
    },
    ...(lowmem ? { cpus: 1, workerThreads: false } : {}),
  },
};

export default nextConfig;
