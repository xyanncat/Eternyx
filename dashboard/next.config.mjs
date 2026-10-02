/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    // This repo has lockfiles at both the repo root and dashboard/ —
    // pin the workspace root so the warning doesn't print on every boot.
    root: import.meta.dirname,
  },
};

export default nextConfig;
