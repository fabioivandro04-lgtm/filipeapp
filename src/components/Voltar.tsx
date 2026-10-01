"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const chave = (lista: string) => `voltar:${lista}`;

/** Posto numa lista (máquinas, faturas…): guarda a pesquisa e os filtros atuais para o «Voltar» os repor. */
export function LembrarLista() {
  const caminho = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    // Mensagens de sucesso/erro não se repetem ao voltar
    const p = new URLSearchParams(params.toString());
    p.delete("ok"); p.delete("erro");
    try { sessionStorage.setItem(chave(caminho), p.toString() ? `${caminho}?${p}` : caminho); } catch { /* modo privado */ }
  }, [caminho, params]);
  return null;
}

/** «← Máquinas»: volta à lista com a pesquisa e os filtros que lá estavam. */
export function Voltar({ lista, texto }: { lista: string; texto: string }) {
  const href = useSyncExternalStore(
    () => () => {},
    () => { try { return sessionStorage.getItem(chave(lista)) ?? lista; } catch { return lista; } }, // modo privado
    () => lista,
  );
  return <Link href={href} className="text-sm text-slate-500 hover:text-slate-900">← {texto}</Link>;
}
