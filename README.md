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
- **Utilizadores** e cargos (admin, operador, contabilista).
- **Aprovações**: propostas de edição dos contabilistas, aceites ou rejeitadas (com motivo) por um admin.

## Online (Vercel + Postgres)
Variáveis de ambiente:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Ligação Postgres (ex.: Supabase «Transaction pooler»). Obrigatória online. |
| `FILIPE_PASSWORD`, `LISA_PASSWORD`, `CONTABILIDADE_PASSWORD` | Palavras-passe iniciais. Sem elas, em produção são geradas e escritas no log. |
| `COOKIE_SECURE=1` | Cookie só por HTTPS (pôr sempre online). |
| `ANTHROPIC_API_KEY` | Leitura automática por IA (fornecedor, categoria, artigos). Sem ela o QR fiscal continua a funcionar. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de email à contabilidade. Gmail: `smtp.gmail.com`, porta `465`, palavra-passe de aplicação. |
