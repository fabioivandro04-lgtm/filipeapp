"use client";
import { usePathname, useRouter } from "next/navigation";
import { guardarCapturas } from "@/lib/capturas";
import Icone from "./Icone";

/** Botão central da barra do telemóvel: abre logo a câmara e leva a foto para o ecrã de captura. */
export default function BotaoCapturar() {
  const router = useRouter();
  const caminho = usePathname();
  return (
    <label className="relative flex cursor-pointer flex-col items-center gap-0.5 pb-2 text-xs font-medium text-brand-700">
      <span className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg ring-4 ring-white active:scale-95">
        <Icone nome="camara" className="h-7 w-7" />
      </span>
      Capturar
      <input type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!f.length) return;
          guardarCapturas(f);
          // Já no ecrã de captura: avisa-o para ir buscar a foto nova
          if (caminho === "/upload") window.dispatchEvent(new Event("capturas"));
          else router.push("/upload");
        }} />
    </label>
  );
}
