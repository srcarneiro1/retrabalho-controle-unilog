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
Regra inicial:
- Nacionalização = R$ 0,40.
- RFID = adicional de R$ 0,20.
- Nacionalização + RFID = R$ 0,60 quando ambas se aplicam à unidade.

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
