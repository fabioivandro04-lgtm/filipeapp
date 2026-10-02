# A fazer

## Ideias (por decidir / começar)

### Perguntar à app (perguntas em português)
Caixa de perguntas dentro da app, ex.: «Que máquinas da Indico estão paradas há mais de 2 anos?» ou «Quanto gastámos em peças na SL 241 este ano?».

- **Como funciona:** a pessoa escreve (ou dita no telemóvel); a app dá ao Claude um conjunto **fixo** de consultas só de leitura (stock, máquinas, prazos, alugueres, gastos por máquina/fornecedor/mês, rentabilidade); o Claude escolhe a consulta, a app executa-a e a resposta vem em português com tabela, ligações às máquinas/faturas, botão «Exportar para Excel» e os filtros usados.
- **Garantias:** só leitura; sem SQL livre; só responde com o que a consulta devolve (nunca inventa); respeita o cargo de cada pessoa; cada pergunta fica no Histórico; limite diário de gasto.
- **Precisa de:** `ANTHROPIC_API_KEY` na Vercel (a mesma que ativa a leitura automática das faturas); alguns cêntimos por pergunta (estimativa). Confirmar com o dono os termos da API (os dados consultados passam pela Anthropic).
- **Limitação:** a qualidade depende dos dados. Hoje há as 603 máquinas mas quase nenhuma fatura nem aluguer; no início funcionam bem as perguntas de stock e prazos, as de custos e rentabilidade só depois de as faturas e os alugueres estarem carregados e ligados às máquinas.
- **Fases:** (1) página «Perguntar» + ~10 consultas + permissões; (2) tabelas, ligações e exportar para Excel; (3) ditar no telemóvel e avisos («avisa-me quando…»).

### Outras ideias já discutidas
- **Stock parado e anúncios:** lista «a vender» por tempo parado (hoje 200 de 302 máquinas há mais de 1 ano ≈ 1,63 M€ em valor de compra), alerta aos 12 meses, anúncios prontos (texto, ficha, fotos), preço sugerido pelo histórico.
- **Margem real por máquina vendida:** precisa de as empresas registarem o **valor de venda** (hoje os ficheiros de stock não o têm).
- **Gastos por fornecedor:** quanto se gasta, subidas de preço, duplicação.
- **Email próprio para faturas:** os fornecedores enviam para lá, a app lê o QR, identifica a empresa pelo NIF e classifica.
- **Transferências entre empresas do grupo registadas uma só vez** (atualiza as duas empresas).
- **Alugueres:** contratos, calendário de disponibilidade, faturação mensal ligada ao programa certificado (só se o aluguer for um negócio ativo).
- **Manutenção por horas** com aviso; **conciliação bancária**; **cruzamento com o e-Fatura**.

## Pendente (configuração e dados)
- [ ] Mudar a palavra-passe da base de dados do Supabase (foi escrita numa conversa) e atualizar `DATABASE_URL` na Vercel.
- [ ] Confirmar que o Filipe, a Lisa e a Laura mudaram as palavras-passe iniciais (Definições).
- [ ] Definições → Servidor de email (Gmail: `smtp.gmail.com`, porta 465, palavra-passe de aplicação) e **Enviar email de teste**.
- [ ] Definições → Alertas por email: destinatários e **Enviar agora** para confirmar.
- [ ] Corrigir o NIF da BIGEXAMPLE, S.A. (o dígito de controlo não é válido).
- [ ] Criar `ANTHROPIC_API_KEY` na Vercel (leitura automática de faturas; e, mais tarde, «Perguntar à app»).
- [ ] Testar o pacote da contabilidade com faturas reais capturadas e confirmar que a plataforma deles lê os QR dos PDFs; perguntar se usam o TOConline e se têm acesso à API.
- [ ] Registar os seguros, inspeções e IUC em «Prazos e documentos» e os alugueres nas fichas das máquinas (a Rentabilidade começa vazia).
- [ ] Reenviar às empresas a lista `Problemas_stock_para_corrigir.xlsx` e importar os ficheiros corrigidos (Máquinas → Importar stock).
- [ ] Confirmar o significado do asterisco (*) nos números internos (133 máquinas).
