import { redirect } from "next/navigation";
import { editaDireto, requireUser } from "@/lib/auth";

// A leitura da fatura pela IA corre depois da resposta e pode demorar (vários modelos, até 240 s); dá tempo à função (Vercel).
export const maxDuration = 300;

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!editaDireto(user)) redirect("/"); // o contabilista não carrega faturas
  return children;
}
