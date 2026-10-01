import type { NextConfig } from "next";

// Política de conteúdo: a app só carrega código, imagens e ligações do próprio sítio.
// «unsafe-inline» nos scripts é necessário para o arranque do Next; mesmo assim bloqueia código vindo de fora.
// Em desenvolvimento o Next precisa de «eval» (recarregamento rápido), por isso só se aplica em produção.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", // wasm: leitor de PDF (QR)
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",          // pré-visualização do PDF da fatura
  "worker-src 'self' blob:",   // leitor de PDF
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",    // ninguém pode meter a app dentro de outra página (clickjacking)
].join("; ");

const comuns = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];
const producao = process.env.NODE_ENV === "production";
const paginas = [...(producao ? [{ key: "Content-Security-Policy", value: csp }] : []), { key: "X-Frame-Options", value: "DENY" }, ...comuns];
// Os ficheiros (PDF/foto da fatura) podem aparecer dentro das páginas da própria app (pré-visualização), mas nunca de outros sítios
const ficheiros = [...(producao ? [{ key: "Content-Security-Policy", value: csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }] : []), { key: "X-Frame-Options", value: "SAMEORIGIN" }, ...comuns];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!api/file/|api/documentos/).*)", headers: paginas },
      { source: "/api/file/:id", headers: ficheiros },
      { source: "/api/documentos/:id", headers: ficheiros },
    ];
  },
  // As fotos seguem por «server actions», que por defeito só aceitam 1 MB.
  // A Vercel recusa pedidos acima de 4,5 MB; o browser comprime as fotos para ficar abaixo.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
};

export default nextConfig;
