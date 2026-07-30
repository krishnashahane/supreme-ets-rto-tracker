/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    // Documents are served through the authenticated /api/download route (which
    // redirects to short-lived signed R2 URLs), so no remote image host is needed.
    remotePatterns: [],
  },
};

export default nextConfig;
