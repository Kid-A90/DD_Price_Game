import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    localPatterns: [
      { pathname: "/brand/**" },
      { pathname: "/ui/**" },
      { pathname: "/placeholders/**" },
      { pathname: "/products/approved/**" }
    ]
  }
};

export default nextConfig;
