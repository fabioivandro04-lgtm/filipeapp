"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { carregarFatura, verificarQr, type VerificacaoQr } from "@/app/actions";
import { CATEGORIAS } from "@/lib/categorias";
import { lerQrDoFicheiro } from "@/lib/qr-cliente";
import { lerQrFiscal, type QrFatura } from "@/lib/qr";
import { tirarCapturas } from "@/lib/capturas";
import { dataPt, money } from "@/lib/format";
import { PageHeader } from "@/components/Ui";
import Icone from "@/components/Icone";
import Camara from "@/components/Camara";

const LIMITE_BYTES = 3.2 * 1024 * 1024; // abaixo dos 4,5 MB da Vercel, com folga para o resto do pedido

/** Foto → JPEG com o tamanho pedido (converte HEIC/WebP; mantém resolução suficiente para o QR ficar nítido). */
async function paraJpeg(file: File, alvo: number): Promise<File> {
  if (file.type === "application/pdf") return file;
  if ((file.type === "image/jpeg" || file.type === "image/png") && file.size <= alvo) return file;
  try {
    const bmp = await createImageBitmap(file);
    let melhor: Blob | null = null;
    for (const [lado, qualidade] of [[3000, 0.9], [2600, 0.88], [2200, 0.84], [1800, 0.78], [1500, 0.72]]) {
      const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * esc);
      canvas.height = Math.round(bmp.height * esc);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
      if (blob) melhor = blob;
      if (blob && blob.size <= alvo) break;
    }
    return melhor ? new File([melhor], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

type Estado = "a-ler" | "qr" | "sem-qr" | "a-enviar" | "enviada" | "erro";
type Item = {
  id: number; paginas: File[]; previews: string[]; pdf: boolean; estado: Estado;
  qrTexto: string | null; qr: QrFatura | null; verif: VerificacaoQr | null; forcar: boolean; faturaId?: number; erro?: string;
};
let seq = 0;

export default function Capturar() {
  const [itens, setItens] = useState<Item[]>([]);
  const [aEnviar, setAEnviar] = useState(false);
  const [empresa, setEmpresa] = useState("");
  const [categoria, setCategoria] = useState("");
  // Câmara própria (resolução máxima, guia e QR em direto). `nativa` é o plano B: a câmara do telemóvel.
  const [camara, setCamara] = useState<{ modo: "nova" | "pagina" | "substituir"; id?: number } | null>(null);
  const alvoNativo = useRef<{ modo: "nova" | "pagina" | "substituir"; id?: number } | null>(null);
  const nativa = useRef<HTMLInputElement>(null);
  const itensRef = useRef(itens);
  useEffect(() => { itensRef.current = itens; }, [itens]);

  const atualizar = (id: number, m: Partial<Item>) => setItens((l) => l.map((i) => (i.id === id ? { ...i, ...m } : i)));

  /** Procura o QR fiscal nas páginas (no original, antes de comprimir) e verifica se a fatura já existe. */
  async function analisar(id: number, paginas: File[]) {
    atualizar(id, { estado: "a-ler" });
    let texto: string | null = null;
    for (const p of paginas) { texto = await lerQrDoFicheiro(p); if (texto) break; }
    const qr = lerQrFiscal(texto);
    let verif: VerificacaoQr | null = null;
    if (texto) { try { verif = await verificarQr(texto); } catch { verif = null; } }
    atualizar(id, { estado: qr ? "qr" : "sem-qr", qrTexto: texto, qr, verif });
  }

  /** Cada foto ou PDF escolhido é uma fatura nova. */
  function novasFaturas(files: File[]) {
    const novos = files.map((f): Item => {
      const pdf = f.type === "application/pdf";
      return { id: ++seq, paginas: [f], previews: pdf ? [] : [URL.createObjectURL(f)], pdf, estado: "a-ler", qrTexto: null, qr: null, verif: null, forcar: false };
    });
    setItens((l) => [...l, ...novos]);
    for (const n of novos) void analisar(n.id, n.paginas);
  }

  function juntarPagina(id: number, files: File[], substituir = false) {
    const atual = itensRef.current.find((i) => i.id === id);
    if (!atual || !files.length) return;
    if (substituir) atual.previews.forEach((u) => URL.revokeObjectURL(u));
    const paginas = substituir ? files : [...atual.paginas, ...files];
    const previews = [...(substituir ? [] : atual.previews), ...files.map((f) => URL.createObjectURL(f))];
    atualizar(id, { paginas, previews, forcar: false });
    void analisar(id, paginas);
  }

  function remover(id: number) {
    itensRef.current.find((i) => i.id === id)?.previews.forEach((u) => URL.revokeObjectURL(u));
    setItens((l) => l.filter((i) => i.id !== id));
  }

  // Fotos tiradas no botão «Capturar» da barra de baixo (agora ou já com este ecrã aberto)
  useEffect(() => {
    const buscar = () => { const f = tirarCapturas(); if (f.length) novasFaturas(f); };
    queueMicrotask(buscar);
    window.addEventListener("capturas", buscar);
    return () => window.removeEventListener("capturas", buscar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fotoDaCamara(f: File) {
    if (!camara) return;
    if (camara.modo === "nova") novasFaturas([f]);
    else if (camara.id) juntarPagina(camara.id, [f], camara.modo === "substituir");
  }
  function semCamara() {
    alvoNativo.current = camara;
    setCamara(null);
    nativa.current?.click();
  }

  const prontas = itens.filter((i) => ["qr", "sem-qr", "erro"].includes(i.estado) && (!i.verif?.duplicada || i.forcar));
  const aLer = itens.some((i) => i.estado === "a-ler");

  async function enviarTodas() {
    setAEnviar(true);
    for (const it of prontas) {
      atualizar(it.id, { estado: "a-enviar", erro: undefined });
      try {
        const fd = new FormData();
        fd.set("empresa", empresa);
        fd.set("categoria", categoria);
        fd.set("qr", it.qrTexto ?? "");
        if (it.pdf) fd.set("ficheiro", it.paginas[0]);
        else {
          // Original para guardar (qualidade máxima que cabe) + cópia pequena só para a IA ler depressa
          const n = it.paginas.length, leitura = 450 * 1024;
          const alvo = Math.min(2.7 * 1024 * 1024, (LIMITE_BYTES - n * leitura) / n);
          for (const p of it.paginas) { fd.append("pagina", await paraJpeg(p, alvo)); fd.append("leitura", await paraJpeg(p, leitura)); }
        }
        const r = await carregarFatura(fd);
        atualizar(it.id, r.erro ? { estado: "erro", erro: r.erro } : { estado: "enviada", faturaId: r.id });
      } catch {
        atualizar(it.id, { estado: "erro", erro: "Não foi possível enviar. Verifique a ligação e tente outra vez." });
      }
    }
    setAEnviar(false);
  }

  const enviadas = itens.filter((i) => i.estado === "enviada");
  const tudoEnviado = itens.length > 0 && enviadas.length === itens.length;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader titulo="Capturar faturas" subtitulo="Uma fatura de cada vez. A app lê o QR code fiscal logo após a foto e guarda tudo em PDF, pronto para a contabilidade." />

      {!tudoEnviado && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <button type="button" disabled={aEnviar} onClick={() => setCamara({ modo: "nova" })} className="btn-primary py-4 text-base">
            <Icone nome="camara" className="h-5 w-5" />Tirar foto
          </button>
          <label className="btn-ghost cursor-pointer py-4 text-base">
            <Icone nome="faturas" className="h-5 w-5" />Escolher ficheiros (PDF ou fotos)
            <input type="file" multiple accept="image/*,application/pdf" disabled={aEnviar} className="sr-only"
              onChange={(e) => { novasFaturas(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
        </div>
      )}

      <Camara aberta={!!camara} modo={camara?.modo === "nova" ? "varias" : "uma"} onFoto={fotoDaCamara} onFechar={() => setCamara(null)} onSemCamara={semCamara} />
      <input ref={nativa} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []); e.target.value = "";
          const a = alvoNativo.current; if (!f.length || !a) return;
          if (a.modo === "nova") novasFaturas(f); else if (a.id) juntarPagina(a.id, f, a.modo === "substituir");
        }} />

      {!itens.length && (
        <div className="card p-5 text-sm text-slate-600">
          <p className="mb-2 font-medium text-slate-900">Para a foto sair bem</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Fatura inteira dentro dos cantos da câmara, em cima de uma superfície lisa e com boa luz (sem a sombra do telemóvel). Com pouca luz, ligue a lanterna.</li>
            <li>O QR code tem de ficar nítido: é dele que saem o NIF, o número, a data e o total, sem erros. A câmara avisa quando o detetar e tira a foto sozinha.</li>
            <li>Toque no ecrã para focar. Se a imagem estiver a focar, espere um segundo antes de tirar.</li>
            <li>Fatura com várias folhas? Tire a primeira e use «+ Página» para juntar as outras.</li>
          </ul>
        </div>
      )}

      <ul className="space-y-3">
        {itens.map((it, n) => (
          <li key={it.id} className="card p-4">
            <div className="flex gap-3">
              <div className="flex shrink-0 gap-1.5">
                {it.pdf
                  ? <span className="grid h-20 w-16 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500">PDF</span>
                  // eslint-disable-next-line @next/next/no-img-element
                  : it.previews.slice(0, 3).map((u, k) => <img key={k} src={u} alt={`Página ${k + 1}`} className="h-20 w-16 rounded-lg border border-slate-200 object-cover" />)}
                {it.previews.length > 3 && <span className="grid h-20 w-10 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">+{it.previews.length - 3}</span>}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Fatura {n + 1}{!it.pdf && it.paginas.length > 1 ? ` · ${it.paginas.length} páginas` : ""}</p>
                <Situacao it={it} />
              </div>
            </div>

            {it.verif?.duplicada && it.estado !== "enviada" && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                Esta fatura já foi carregada: <Link href={`/faturas/${it.verif.duplicada.id}`} className="font-medium underline">{it.verif.duplicada.fornecedor ?? "ver fatura"} {it.verif.duplicada.numero ?? ""}</Link>.
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={it.forcar} onChange={(e) => atualizar(it.id, { forcar: e.target.checked })} className="h-4 w-4" />Carregar mesmo assim</label>
              </div>
            )}

            {!["a-enviar", "enviada"].includes(it.estado) && !aEnviar && (
              <div className="mt-3 flex flex-wrap gap-2">
                {!it.pdf && (
                  <button type="button" onClick={() => setCamara({ modo: "pagina", id: it.id })} className="btn-ghost px-3 py-1.5 text-xs">+ Página</button>
                )}
                {it.estado === "sem-qr" && !it.pdf && (
                  <button type="button" onClick={() => setCamara({ modo: "substituir", id: it.id })} className="btn-ghost px-3 py-1.5 text-xs">Tirar outra vez</button>
                )}
                <button type="button" onClick={() => remover(it.id)} className="btn-ghost px-3 py-1.5 text-xs text-red-600">Remover</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {itens.length > 0 && !tudoEnviado && (
        <div className="card mt-4 space-y-4 p-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-600">Opções (empresa e categoria)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className="label">Empresa</label>
                <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Automática pelo NIF do QR" className="field" /></div>
              <div><label className="label">Categoria</label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field">
                  <option value="">Detetar automaticamente</option>
                  {CATEGORIAS.map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
                </select></div>
            </div>
          </details>
          <button type="button" onClick={enviarTodas} disabled={aEnviar || aLer || !prontas.length} className="btn-primary w-full py-3 text-base">
            {aEnviar ? "A enviar…" : aLer ? "A ler o QR code…" : !prontas.length ? "Nada para enviar (já carregada)" : `Enviar ${prontas.length} fatura${prontas.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {tudoEnviado && (
        <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm font-medium text-emerald-800">{enviadas.length} fatura{enviadas.length === 1 ? "" : "s"} guardada{enviadas.length === 1 ? "" : "s"}.</p>
          <div className="flex gap-2">
            <Link href="/" className="btn-ghost">Ver faturas</Link>
            <button type="button" onClick={() => { itens.forEach((i) => i.previews.forEach((u) => URL.revokeObjectURL(u))); setItens([]); }} className="btn-primary">Capturar outra</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Situacao({ it }: { it: Item }) {
  if (it.estado === "a-ler") return <p className="text-slate-500">A procurar o QR code…</p>;
  if (it.estado === "a-enviar") return <p className="text-slate-500">A enviar…</p>;
  if (it.estado === "enviada") return <p className="text-emerald-700">Guardada. Os dados são lidos em segundo plano. <Link href={`/faturas/${it.faturaId}`} className="font-medium underline">Abrir e confirmar</Link></p>;
  const q = it.qr;
  return (
    <>
      {q ? (
        <>
          <p className="text-emerald-700">QR fiscal lido</p>
          <p className="text-slate-600">NIF {q.nifEmitente}{q.numero ? ` · ${q.numero}` : ""}{q.data ? ` · ${dataPt(q.data)}` : ""}{q.total != null ? ` · ${money(q.total)}` : ""}</p>
          {q.nifAdquirente && <p className="text-slate-500">Cliente: {it.verif?.empresa ?? `NIF ${q.nifAdquirente} (ainda sem empresa associada)`}</p>}
        </>
      ) : (
        <p className="text-amber-700">QR code não encontrado. Tire outra foto mais perto do QR, com boa luz, ou envie assim (os dados são lidos do texto).</p>
      )}
      {it.estado === "erro" && <p className="mt-1 text-red-700">{it.erro}</p>}
    </>
  );
}
