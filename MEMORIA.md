# MEMÓRIA — RETRABALHO CONTROLE UNILOG

Atualizado em 01/10/2026.

## Arquitetura
Next.js 15 + React 19 + PrimeReact/PrimeIcons; Cloudflare Pages; Pages Functions como gateway; Google Apps Script como API/regra de negócio; Google Sheets como persistência.

Referência visual e arquitetural: Extra Cost Control Unilog.

## Perfis
- OPERACIONAL: cria; não edita.
- SUPERVISOR: cria/edita, auditoria e consulta preços.
- ADMIN: cria/edita, auditoria, usuários e cria vigências de preço.
- CLIENTE: somente leitura, consulta obrigatoriamente mensal, auditoria do mês, preços e exportação.

## Preços
Regra vigente desde 01/10/2026:
- Nacionalização somente = R$ 0,41 por unidade.
- RFID é adicional à Nacionalização = R$ 0,19 por unidade.
- Nacionalização + RFID = R$ 0,60 por unidade.
- Quantidade RFID não pode ser maior que a quantidade de Nacionalização.

Preço é controlado em `TABELA_PRECOS` por vigência.
Nova vigência deve ser posterior à última vigência existente.
Histórico não é sobrescrito.

Cada retrabalho grava:
- ID_PRECO;
- preço unitário Nacionalização;
- preço adicional RFID;
- valor Nacionalização;
- valor RFID;
- valor total cobrança.

## Regras de acesso
- matrícula é o login.
- usuário criado recebe senha temporária e `TROCA_SENHA_OBRIGATORIA=SIM`.
- enquanto a troca estiver pendente, o gateway bloqueia as rotas operacionais e administrativas.
- depois da troca de senha, a sessão é encerrada e o usuário autentica novamente.
- CLIENTE não executa POST/PUT de retrabalho.
- CLIENTE não administra usuários nem preços.
- CLIENTE precisa informar competência `AAAA-MM`.
- auditoria de CLIENTE é filtrada pelos IDs dos retrabalhos da competência.

## Consistência
- edição usa controle otimista por `VERSAO`.
- criação de retrabalho usa `REQUEST_ID`.
- criação de preço usa `REQUEST_ID`.
- histórico fica em `AUDITORIA`, com snapshot antes/depois.
- nunca adicionar retry automático em mutações.
- resposta ambígua de mutação deve ser reconciliada por leitura.
- redirect final do ContentService é lido por GET; não repetir POST no host de conteúdo.

## Segurança
- JWT HttpOnly/Secure/SameSite=Lax, validade 8h.
- senha não é persistida em texto puro.
- hash iterativo SHA-256 + salt individual + pepper em Script Property.
- segredos ficam somente em Cloudflare/Apps Script.
- `APP_SESSION_SECRET` fica somente no Cloudflare.
- `AUTH_PASSWORD_PEPPER` fica somente no Apps Script.
- `APPS_SCRIPT_GATEWAY_TOKEN` no Cloudflare deve corresponder ao `GATEWAY_TOKEN` do Apps Script.
- alterações de perfil/status são exclusivas de ADMIN.
- CSV exportado aplica mitigação de Formula Injection.

## Base
Spreadsheet ID: `1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04`.

Abas:
- RETRABALHOS
- USUARIOS (oculta)
- AUDITORIA (oculta)
- CONFIG (oculta)
- TABELA_PRECOS (oculta)

## Deploy
Cloudflare:
- build: `npm run build`
- output: `dist`
- branch de produção: `main`
- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_GATEWAY_TOKEN`
- `APP_SESSION_SECRET`

Apps Script:
- Web App publicado em produção.
- `SPREADSHEET_ID`
- `GATEWAY_TOKEN`
- `AUTH_PASSWORD_PEPPER`
- bootstrap inicial do ADMIN executado pelo navegador.

## Estado
- planilha estruturada no Google Drive.
- frontend/gateway/API source criados no GitHub.
- CLIENTE + precificação histórica implementados.
- Apps Script Web App publicado e configurado.
- Cloudflare Pages criado e variáveis/segredos configurados.
- novo commit na `main` utilizado para disparar redeploy após configuração das variáveis.
- build validado via GitHub Actions.


## Identidade visual — fonte de verdade
Referências canônicas:
- Extra Cost Control: `docs/PRIMEREACT_DESIGN_SYSTEM.md`;
- BI Logístico V2: `MEMORIA_IDENTIDADE_VISUAL.md`;
- paridade visual consolidada no Extra Cost pelo PR #75.

Regras obrigatórias:
- usar a logo oficial `/brand/unilog-logo-white-transparent.svg`; não substituir por texto "UNILOG";
- sidebar desktop com 244px, fundo `#171b24 → #202632`, logo de 96px e navegação interna compacta;
- item ativo = grafite `#303642` + faixa vermelha `#db0812`;
- bloco de usuário e logout no rodapé;
- grupo administrativo separado por divisor/caption;
- vermelho Unilog `#db0812` como CTA/foco/destaque;
- canvas `#f5f6f8`, superfície branca, borda `#e2e5e9`;
- não permitir azul/índigo visível do tema Lara;
- cards majoritariamente brancos, raio 14px e sombra baixa;
- login com painel grafite, logo oficial e chip do produto;
- primeiro acesso usa a mesma anatomia visual do login.

## Primeiro acesso
A senha inicial é temporária.
Ao autenticar com `TROCA_SENHA_OBRIGATORIA=SIM`, o usuário permanece na experiência de primeiro acesso, define a nova senha e o frontend renova a autenticação de forma transparente com a nova credencial. Não deve haver logout visual nem necessidade de novo login manual.


## Clientes, filiais e escopo de acesso
Estrutura:
- `CLIENTES_FILIAIS` (visível): cadastro manual de CNPJ, nome do cliente, filial e status.
- `USUARIO_FILIAIS` (oculta): relação N:N entre matrícula e CNPJ.
- `RETRABALHOS` grava snapshot de `CNPJ_CLIENTE`, `NOME_CLIENTE` e `FILIAL`.

Regras:
- CNPJ é a chave única da filial; deve possuir 14 dígitos após normalização.
- Não apagar filial que possua histórico; marcar `ATIVO=NAO`.
- filial inativa não pode receber novos lançamentos, mas permanece disponível para histórico.
- ADMIN sem vínculo explícito tem acesso a todas as filiais cadastradas.
- ADMIN pode ser restringido a várias filiais por vínculo explícito.
- OPERACIONAL e SUPERVISOR devem possuir ao menos uma filial vinculada.
- CLIENTE deve possuir ao menos uma filial e pode ter vários CNPJs, desde que todos pertençam ao mesmo `NOME_CLIENTE`.
- listagem, meses, auditoria, criação e edição são filtrados/validados também no backend por matrícula + perfil.
- o dropdown de novo retrabalho exibe apenas filiais ativas permitidas ao usuário.
- renomear cliente/filial no cadastro não altera snapshots históricos já gravados.
