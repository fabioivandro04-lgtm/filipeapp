import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { PageHeader, Stat } from "@/components/Ui";

export default async function Copias() {
  const user = await requireUser();
  if (user.cargo !== "admin") redirect("/");
  const r = (await queryOne<{ faturas: number; apagadas: number; ficheiros: number; mb: number }>(
    `SELECT (SELECT COUNT(*)::int FROM faturas WHERE apagada_em IS NULL) AS faturas,
            (SELECT COUNT(*)::int FROM faturas WHERE apagada_em IS NOT NULL) AS apagadas,
            (SELECT COUNT(*)::int FROM ficheiros) AS ficheiros,
            (SELECT COALESCE(SUM(octet_length(dados)),0)::float8 / 1048576 FROM ficheiros) AS mb`))!;
  return (
    <>
      <Link href="/definicoes#dados" className="text-sm text-slate-500 hover:text-slate-900">← Definições</Link>
      <div className="mt-2" />
      <PageHeader titulo="Cópia de segurança" subtitulo="Guarde uma cópia de tudo fora da internet, para o caso de algo correr mal." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat rotulo="Faturas" valor={String(r.faturas)} />
        <Stat rotulo="Apagadas (recuperáveis)" valor={String(r.apagadas)} />
        <Stat rotulo="Fotos e PDFs" valor={String(r.ficheiros)} />
        <Stat rotulo="Tamanho" valor={`${r.mb.toFixed(1)} MB`} />
      </div>
      <div className="card space-y-3 p-5">
        <p className="text-sm text-slate-600">O ficheiro ZIP inclui todos os dados (empresas, prédios, máquinas, faturas, histórico e utilizadores), o Excel com as faturas e as fotos e PDFs originais.
          Não leva palavras-passe. Guarde-o num sítio seguro, porque contém dados fiscais.</p>
        <a href="/api/backup" className="btn-primary">Descarregar cópia completa</a>
        <p className="text-xs text-slate-500">Recomendação: faça uma cópia no fim de cada mês. Pode demorar um pouco se houver muitas fotos.</p>
      </div>
    </>
  );
}
