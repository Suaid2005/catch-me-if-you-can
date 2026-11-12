/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode for catching common bugs during development
  reactStrictMode: true,

  // Environment variables that are safe to expose to the browser
  // (Never put secrets here — only public URLs)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8000",
  },
};

module.exports = nextConfig;
