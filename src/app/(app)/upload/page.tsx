"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { carregarFatura } from "@/app/actions";
import { CATEGORIAS } from "@/lib/categorias";
import { lerQrDoFicheiro } from "@/lib/qr-cliente";
import { PageHeader } from "@/components/Ui";

const ALVO_BYTES = 3.2 * 1024 * 1024; // abaixo do limite de 4,5 MB da Vercel, com folga para o resto do pedido

/** Reduz fotos grandes do telemóvel e converte formatos como HEIC (iPhone) para JPEG. */
async function comprimir(file: File): Promise<File> {
  if (file.type === "application/pdf" || file.type === "image/gif") return file;
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return file;
  try {
    const bmp = await createImageBitmap(file);
    let melhor: Blob | null = null;
    // Tenta tamanhos e qualidades cada vez mais baixos até caber
    for (const [lado, qualidade] of [[2200, 0.85], [1800, 0.78], [1400, 0.7], [1100, 0.65]]) {
      const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * escala);
      canvas.height = Math.round(bmp.height * escala);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
      if (blob) melhor = blob;
      if (blob && blob.size <= ALVO_BYTES) break;
    }
    if (!melhor) return file;
    const formatoAceite = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    if (formatoAceite && file.size <= ALVO_BYTES && melhor.size >= file.size) return file; // já é pequena
    return new File([melhor], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function Upload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [estado, setEstado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = estado !== null;

  const adicionar = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = "";
  };

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd0 = new FormData(e.currentTarget);
    const ids: number[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setEstado(`A ler a fatura ${i + 1} de ${files.length}… pode demorar`);
        const fd = new FormData();
        fd.set("empresa", String(fd0.get("empresa") ?? ""));
        fd.set("categoria", String(fd0.get("categoria") ?? ""));
        fd.set("qr", (await lerQrDoFicheiro(files[i])) ?? ""); // QR fiscal, lido no original (antes de comprimir)
        fd.set("ficheiro", await comprimir(files[i]));
        const r = await carregarFatura(fd);
        if (r.erro) { setErro(r.erro); setEstado(null); return; }
        ids.push(r.id!);
      }
    } catch {
      setErro("Não foi possível enviar. Verifique a ligação e tente novamente (ou use uma foto mais pequena).");
      setEstado(null);
      return;
    }
    router.push(ids.length === 1 ? `/faturas/${ids[0]}` : "/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader titulo="Carregar faturas" subtitulo="Tire uma foto ou escolha ficheiros. A app lê o QR code fiscal e os dados sozinha." />
      <form onSubmit={enviar} className="card space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="btn-primary cursor-pointer py-4">
            Tirar foto
            <input type="file" accept="image/*" capture="environment" onChange={adicionar} disabled={ocupado} className="sr-only" />
          </label>
          <label className="btn-ghost cursor-pointer py-4">
            Escolher ficheiros
            <input type="file" multiple accept="image/*,application/pdf" onChange={adicionar} disabled={ocupado} className="sr-only" />
          </label>
        </div>

        {files.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate">{f.name}</span>
                {!ocupado && <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} className="text-xs text-slate-500 hover:text-red-600">Remover</button>}
              </li>
            ))}
          </ul>
        ) : <p className="text-center text-sm text-slate-500">Nenhum ficheiro selecionado</p>}

        <div>
          <label className="label">Empresa (opcional)</label>
          <input name="empresa" placeholder="Ex.: Filipe Lda" className="field" />
        </div>
        <div>
          <label className="label">Categoria</label>
          <select name="categoria" className="field">
            <option value="">Detetar automaticamente</option>
            {CATEGORIAS.map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
          </select>
        </div>
        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        <button disabled={ocupado || !files.length} className="btn-primary w-full">{estado ?? "Enviar"}</button>
      </form>
    </div>
  );
}
