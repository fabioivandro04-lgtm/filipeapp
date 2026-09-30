// A leitura da fatura pela IA pode demorar; dá tempo à função (Vercel).
export const maxDuration = 60;

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
