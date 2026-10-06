"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Enquanto houver faturas a ser lidas em segundo plano, recarrega os dados a cada 3 s (no máximo 3 minutos). */
export default function AtualizarSePendente({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    let n = 0;
    const t = setInterval(() => { if (++n > 60) clearInterval(t); else router.refresh(); }, 3000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
