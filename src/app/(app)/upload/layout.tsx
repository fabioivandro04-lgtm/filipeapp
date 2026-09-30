import { redirect } from "next/navigation";
import { editaDireto, requireUser } from "@/lib/auth";

// A leitura da fatura pela IA pode demorar; dá tempo à função (Vercel).
export const maxDuration = 60;

export default async function UploadLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!editaDireto(user)) redirect("/"); // o contabilista não carrega faturas
  return children;
}
