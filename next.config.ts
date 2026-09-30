import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // As fotos seguem por «server actions», que por defeito só aceitam 1 MB.
  // A Vercel recusa pedidos acima de 4,5 MB; o browser comprime as fotos para ficar abaixo.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
