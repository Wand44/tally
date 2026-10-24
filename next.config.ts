import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // libSQL ships native bindings; keep it out of the server bundle.
  serverExternalPackages: ['@libsql/client'],
  // The home directory has its own package.json; pin the build root here.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
