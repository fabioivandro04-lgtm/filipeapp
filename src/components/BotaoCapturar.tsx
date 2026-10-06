"use client";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { guardarCapturas } from "@/lib/capturas";
import Camara from "./Camara";
import Icone from "./Icone";

/** Botão central da barra do telemóvel: abre a câmara própria e leva as fotos para o ecrã de captura. */
export default function BotaoCapturar() {
  const router = useRouter();
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const nativa = useRef<HTMLInputElement>(null);
  const tiradas = useRef(0);

  const concluir = () => {
    setAberta(false);
    if (!tiradas.current) return;
    tiradas.current = 0;
    // Já no ecrã de captura: avisa-o para ir buscar as fotos novas
    if (caminho === "/upload") window.dispatchEvent(new Event("capturas"));
    else router.push("/upload");
  };

  return (
    <>
      <button type="button" onClick={() => { tiradas.current = 0; setAberta(true); }} className="relative flex cursor-pointer flex-col items-center gap-0.5 pb-2 text-xs font-medium text-brand-700">
        <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white active:scale-95">
          <Icone nome="camara" className="h-7 w-7" />
        </span>
        Capturar
      </button>
      <Camara aberta={aberta} modo="varias" onFoto={(f) => { tiradas.current++; guardarCapturas([f]); }} onFechar={concluir}
        onSemCamara={() => { setAberta(false); nativa.current?.click(); }} />
      {/* Plano B: se a câmara própria não abrir (sem permissão ou navegador antigo), usa a câmara do telemóvel */}
      <input ref={nativa} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!f.length) return;
          guardarCapturas(f); tiradas.current = f.length; concluir();
        }} />
    </>
  );
}
