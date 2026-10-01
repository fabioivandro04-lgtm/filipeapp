// Aparece logo ao mudar de página, enquanto os dados chegam: a app nunca parece «parada».
export default function Carregando() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="A carregar">
      <div className="mb-6 h-8 w-48 rounded-lg bg-slate-200" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100" />)}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100" />)}
      </div>
    </div>
  );
}
