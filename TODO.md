# A fazer

## Ideias (por decidir / começar)

### Perguntar à app (perguntas em português)
Caixa de perguntas dentro da app, ex.: «Que máquinas da Indico estão paradas há mais de 2 anos?» ou «Quanto gastámos em peças na SL 241 este ano?».

- **Como funciona:** a pessoa escreve (ou dita no telemóvel); a app dá ao Claude um conjunto **fixo** de consultas só de leitura (stock, máquinas, prazos, alugueres, gastos por máquina/fornecedor/mês, rentabilidade); o Claude escolhe a consulta, a app executa-a e a resposta vem em português com tabela, ligações às máquinas/faturas, botão «Exportar para Excel» e os filtros usados.
- **Garantias:** só leitura; sem SQL livre; só responde com o que a consulta devolve (nunca inventa); respeita o cargo de cada pessoa; cada pergunta fica no Histórico; limite diário de gasto.
- **Precisa de:** `ANTHROPIC_API_KEY` na Vercel (a mesma que ativa a leitura automática das faturas); alguns cêntimos por pergunta (estimativa). Confirmar com o dono os termos da API (os dados consultados passam pela Anthropic).
- **Limitação:** a qualidade depende dos dados. Hoje há as 603 máquinas mas quase nenhuma fatura nem aluguer; no início funcionam bem as perguntas de stock e prazos, as de custos e rentabilidade só depois de as faturas e os alugueres estarem carregados e ligados às máquinas.
- **Fases:** (1) página «Perguntar» + ~10 consultas + permissões; (2) tabelas, ligações e exportar para Excel; (3) ditar no telemóvel e avisos («avisa-me quando…»).

### Próximas melhorias (escolhidas; ordem de prioridade)
1. **Stock parado e anúncios** (o que mais mexe com dinheiro): hoje 200 máquinas há mais de 1 ano ≈ 1,63 M€ em valor de compra. Lista «a vender», alerta aos 12 meses, anúncios prontos (texto, ficha, fotos).
2. **Leitura automática de faturas com IA** (sem QR ou com QR ilegível): **feito, em testes** com OpenRouter e modelos gratuitos (`OPENROUTER_API_KEY` já na Vercel). Falta: testar com faturas fictícias variadas, decidir o modelo pago para produção (`AI_MODEL`) e confirmar com o dono a privacidade.
3. **Aviso de espaço da base de dados** (ex.: acima de 70% do limite) e **verificação periódica da cópia de segurança**.
4. **Margem real por máquina vendida** (precisa de registar o valor de venda).
5. **Gastos por fornecedor:** subidas de preço e duplicados.

### Outras ideias já discutidas
- **Stock parado e anúncios:** lista «a vender» por tempo parado (hoje 200 de 302 máquinas há mais de 1 ano ≈ 1,63 M€ em valor de compra), alerta aos 12 meses, anúncios prontos (texto, ficha, fotos), preço sugerido pelo histórico.
- **Margem real por máquina vendida:** precisa de as empresas registarem o **valor de venda** (hoje os ficheiros de stock não o têm).
- **Gastos por fornecedor:** quanto se gasta, subidas de preço, duplicação.
- **Email próprio para faturas:** os fornecedores enviam para lá, a app lê o QR, identifica a empresa pelo NIF e classifica.
- **Transferências entre empresas do grupo registadas uma só vez** (atualiza as duas empresas).
- **Alugueres:** contratos, calendário de disponibilidade, faturação mensal ligada ao programa certificado (só se o aluguer for um negócio ativo).
- **Manutenção por horas** com aviso; **conciliação bancária**; **cruzamento com o e-Fatura**.

### Mover os ficheiros das faturas para o Supabase Storage (decidido, fazer mais tarde)
Hoje os PDFs/fotos ficam na base de dados (~1 MB cada); o Pro inclui 8 GB, que a 700–2000 faturas/mês dura 4–12 meses. No Storage (100 GB incluídos no Pro) duram vários anos.

- **Fazer:** (1) guardar ficheiros no Storage (bucket privado, servidos pela app após validar o cargo); (2) migrar os ficheiros existentes; (3) comprimir fotos à captura sem perder a leitura do QR; (4) ajustar pacote da contabilidade, apagados, anexos de documentos; (5) incluir os ficheiros na cópia de segurança manual (as cópias diárias do Pro só cobrem a base de dados); (6) verificação periódica de ficheiros órfãos / faturas sem ficheiro.
- **Precisa de:** chave de serviço do Supabase na Vercel (só servidor).
- **Custo estimado:** Supabase Pro ≈ 25 US$/mês + Vercel Pro ≈ 20 US$/mês, sem extras de disco.
- **Antes disso:** passar o Supabase a Pro antes de carregar faturas a sério (o Free tem 500 MB e sem cópias automáticas).
- **Opcional:** aviso na app quando a base de dados passar de 70% do limite.

## Pendente (configuração e dados)
- [ ] Mudar a palavra-passe da base de dados do Supabase (foi escrita numa conversa) e atualizar `DATABASE_URL` na Vercel.
- [ ] Confirmar que o Filipe, a Lisa e a Laura mudaram as palavras-passe iniciais (Definições).
- [ ] Definições → Servidor de email (Gmail: `smtp.gmail.com`, porta 465, palavra-passe de aplicação) e **Enviar email de teste**.
- [ ] Definições → Alertas por email: destinatários e **Enviar agora** para confirmar.
- [ ] Corrigir o NIF da BIGEXAMPLE, S.A. (o dígito de controlo não é válido).
- [ ] Apagar a chave OpenRouter de testes (foi escrita numa conversa) e criar outra, com limite de gasto, na Vercel.
- [ ] Antes de usar faturas reais: trocar `AI_MODEL` para um modelo pago (os gratuitos podem registar os pedidos).
- [ ] Testar o pacote da contabilidade com faturas reais capturadas e confirmar que a plataforma deles lê os QR dos PDFs; perguntar se usam o TOConline e se têm acesso à API.
- [ ] Registar os seguros, inspeções e IUC em «Prazos e documentos» e os alugueres nas fichas das máquinas (a Rentabilidade começa vazia).
- [ ] Reenviar às empresas a lista `Problemas_stock_para_corrigir.xlsx` e importar os ficheiros corrigidos (Máquinas → Importar stock).
- [ ] Confirmar o significado do asterisco (*) nos números internos (133 máquinas).
