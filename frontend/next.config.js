
const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly identify the frontend project root.
  outputFileTracingRoot: path.join(__dirname),

  reactStrictMode: true,

  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
