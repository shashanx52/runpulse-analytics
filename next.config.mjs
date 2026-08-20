/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CSVs are read off disk at request time, so nothing here is bundled.
  // sessions.csv is a training input only and is 11 MB; excluding it keeps the
  // serverless bundle small.
  experimental: {
    outputFileTracingIncludes: {
      "/api/**": ["./data/*_daily.csv", "./data/ticket_products.csv", "./ml/models/**"],
    },
  },
};
export default nextConfig;
