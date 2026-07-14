/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ui-kit se distribuye como TS/CJS sin build previo: Next lo transpila.
  transpilePackages: ["@aegis/ui-kit"],
};

export default nextConfig;
