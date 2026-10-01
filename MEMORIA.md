# MEMÓRIA — RETRABALHO CONTROLE UNILOG

Atualizado em 30/09/2026.

## Arquitetura
Next.js 15 + React 19 + PrimeReact/PrimeIcons; Cloudflare Pages; Pages Functions como gateway; Google Apps Script como API/regra de negócio; Google Sheets como persistência.

Referência visual e arquitetural: Extra Cost Control Unilog.

## Regras de acesso
- OPERACIONAL cria lançamentos e não edita registros existentes.
- SUPERVISOR cria/edita e consulta auditoria.
- ADMIN cria/edita, consulta auditoria e gerencia usuários.
- matrícula é o login.
- usuário criado recebe senha temporária e `TROCA_SENHA_OBRIGATORIA=SIM`.
- enquanto a troca estiver pendente, o gateway bloqueia as rotas operacionais e administrativas.
- depois da troca de senha, a sessão é encerrada e o usuário autentica novamente.

## Consistência
- edição usa controle otimista por `VERSAO`.
- criação de retrabalho usa `REQUEST_ID` persistido para idempotência.
- histórico fica em `AUDITORIA`, com snapshot antes/depois.
- nunca adicionar retry automático em mutações.
- resposta ambígua de mutação deve ser reconciliada por leitura.
- redirect final do ContentService é lido por GET; não repetir POST no host de conteúdo.

## Segurança
- JWT HttpOnly/Secure/SameSite=Lax, validade 8h.
- senha não é persistida em texto puro.
- hash iterativo SHA-256 + salt individual + pepper em Script Property.
- segredos ficam somente em Cloudflare/Apps Script.
- alterações de perfil/status são exclusivas de ADMIN.

## Base
Spreadsheet ID: `1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04`.

Abas:
- RETRABALHOS
- USUARIOS (oculta)
- AUDITORIA (oculta)
- CONFIG (oculta)

## Deploy
Cloudflare:
- build: `npm run build`
- output: `dist`
- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_GATEWAY_TOKEN`
- `APP_SESSION_SECRET`

Apps Script:
- `SPREADSHEET_ID`
- `GATEWAY_TOKEN`
- `AUTH_PASSWORD_PEPPER`
- executar `bootstrapAdmin(...)` uma única vez.

## Estado
- planilha estruturada no Google Drive.
- frontend/gateway/API source criados no GitHub.
- CI de build criado e sendo usado para homologação técnica.
- Apps Script Web App ainda não foi implantado porque não há conector Apps Script nesta sessão.
- Cloudflare Pages ainda não foi criado na conta porque não há conector Cloudflare disponível nesta sessão.
