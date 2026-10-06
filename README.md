# GESTAO APP

Gestão de faturas: carrega-se uma foto ou PDF, a app lê o **QR code fiscal da AT** (NIF, data, nº, ATCUD, IVA e total,
sem custo) e, se houver chave, também o resto com IA. Depois distribui por empresa, prédio e máquina e prepara o pacote
do mês para a contabilidade.

## Local (Mac)
Duplo clique em `start.command`, ou:

```bash
npm install
npm run dev -- -p 3210      # http://localhost:3210
```

Sem configuração, usa um Postgres embutido (PGlite) em `data/pg`. Requer Node 22+.
Utilizadores de exemplo (só em `npm run dev`): `filipe@local / filipe123` (admin), `lisa@local / lisa123`
(operador), `contabilidade@local / conta123` (contabilista).

## Cargos
| Cargo | O que pode fazer |
|---|---|
| **Admin** | Tudo: carregar, editar, apagar, empresas, prédios, máquinas, utilizadores, histórico, cópias, enviar à contabilidade e **aceitar ou rejeitar** as propostas dos contabilistas. |
| **Operador** | Carrega e edita faturas diretamente; envia o pacote à contabilidade. |
| **Contabilista** | Vê tudo e descarrega o pacote do mês, mas **não carrega**. As edições que faz ficam como proposta e só entram em vigor depois de um admin as aceitar (menu *Aprovações*). |

## O que faz
- **Carregar**: fotos (câmara do telemóvel) e PDFs; lê o QR fiscal no próprio browser. O NIF do cliente no QR liga a fatura
  à empresa certa (defina os NIF em *Mais → Empresas*).
- **Alertas**: possíveis duplicados (ATCUD), valores acima da média, água/energia sem prédio e meses sem fatura.
- **Relatórios** por mês, empresa e categoria; **Excel** com os filtros.
- **Contabilidade**: pacote do mês (Excel + originais com o QR intacto) em ZIP ou por email, com controlo do que já foi enviado.
- **Histórico**: quem criou, editou ou apagou; desfazer edições; restaurar faturas apagadas.
- **Cópia de segurança**: ZIP com todos os dados e ficheiros (sem palavras-passe).
- **Máquinas e stock**: o inventário do grupo. Cada máquina pertence a uma empresa (mesmo dono, empresas diferentes) e tem estado
  em stock / vendida / abatida. *Máquinas → Importar stock* lê os Excel de stock (folhas STOCK, VENDIDO, ABATE…), mostra primeiro o que vai
  acontecer e pode repetir-se sem duplicar. Vendas entre empresas do grupo contam como **transferências**, não como vendas a terceiros.
  Campos vazios são normais (ex.: baldes sem horas). A mesma máquina em duas empresas liga-se pelo nº de série.
- **Utilizadores** e cargos (admin, operador, contabilista).
- **Aprovações**: propostas de edição dos contabilistas, aceites ou rejeitadas (com motivo) por um admin.

## Online (Vercel + Postgres)
Variáveis de ambiente:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Ligação Postgres (ex.: Supabase «Transaction pooler»). Obrigatória online. |
| `FILIPE_PASSWORD`, `LISA_PASSWORD`, `CONTABILIDADE_PASSWORD` | Palavras-passe iniciais. Sem elas, em produção são geradas e escritas no log. |
| `COOKIE_SECURE=1` | Cookie só por HTTPS (em produção já é sempre assim; serve para forçar noutros ambientes). |
| `APP_SECRET` | Chave que cifra os segredos guardados na base de dados (palavra-passe do email nas Definições). Se mudar, esses segredos têm de ser escritos de novo. |
| `CRON_SECRET` | Protege o envio diário de alertas por email (`/api/cron/alertas`). |
| `OPENROUTER_API_KEY` | Leitura automática por IA via OpenRouter (fornecedor, NIF, nº, data, total, IVA, categoria, artigos). Sem chave de IA o QR fiscal continua a funcionar. |
| `AI_MODEL` | Opcional: até 3 modelos do OpenRouter, separados por vírgula (a ordem é a de preferência). Por omissão, modelos **gratuitos** com visão: servem para testes, **não** para faturas reais (os gratuitos podem registar os pedidos). Produção: um modelo pago, p. ex. `google/gemini-3.5-flash-lite` ou `anthropic/claude-haiku-4.5`. |
| `AI_PROVIDER` | Opcional: `openrouter` ou `anthropic` (por omissão, o que tiver chave). |
| `ANTHROPIC_API_KEY` | Alternativa: leitura direta pela API da Anthropic. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de email à contabilidade. Gmail: `smtp.gmail.com`, porta `465`, palavra-passe de aplicação. |


## Segurança

- **Sessões:** o cookie é `HttpOnly`, `Secure` e `SameSite`; na base de dados só fica o hash do token. Mudar o cargo, a palavra-passe ou desativar uma pessoa termina as sessões dela.
- **Login:** máx. 5 tentativas falhadas por email+IP e 25 por IP em 15 minutos (guardadas na base de dados). O tempo de resposta é igual para emails que não existem.
- **Ficheiros:** só PDF e fotos, validados pelo conteúdo e não pelo tipo que o browser declara; servidos com `nosniff`.
- **Cabeçalhos:** política de conteúdo (CSP), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS (ver `next.config.ts`).
- **Base de dados:** todas as tabelas com RLS ligado e sem políticas (a API pública do Supabase fica bloqueada; a app liga-se com o utilizador da base de dados).
- **Segredos na base de dados** (palavra-passe do servidor de email) vão cifrados com `APP_SECRET`; nunca saem na cópia de segurança.
