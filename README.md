# GESTAO APP

Gestão de faturas (Fase 1).

## Local (Mac)
Duplo clique em `start.command`, ou:

```bash
npm install
npm run dev -- -p 3210      # http://localhost:3210
```

Sem configuração, usa um Postgres embutido (PGlite) em `data/pg`. Requer Node 22+.
Utilizadores de exemplo (só em `npm run dev`): `filipe@local / filipe123` (admin), `lisa@local / lisa123`
(operador), `contabilidade@local / conta123` (só vê a categoria contabilidade).

## Online (Vercel + Postgres)
Variáveis de ambiente:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Ligação Postgres (ex.: Supabase, "connection pooling"). Obrigatória online. |
| `FILIPE_PASSWORD`, `LISA_PASSWORD`, `CONTABILIDADE_PASSWORD` | Palavras-passe iniciais. Sem elas, em produção são geradas e escritas no log. |
| `COOKIE_SECURE=1` | Cookie só por HTTPS (pôr sempre online). |
| `ANTHROPIC_API_KEY` | Leitura automática das faturas. Sem ela, preenche-se à mão. |
