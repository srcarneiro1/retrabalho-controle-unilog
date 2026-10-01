# Retrabalho Controle - Unilog

Aplicação transacional para registrar retrabalho de produtos, quantidades e etiquetagem de Nacionalização/RFID.

## Stack
- Next.js 15 + React 19
- PrimeReact 10 + PrimeIcons
- Cloudflare Pages + Pages Functions
- Google Apps Script
- Google Sheets

## Perfis
- OPERACIONAL: cria lançamentos; não edita registros existentes.
- SUPERVISOR: cria e edita; acessa auditoria.
- ADMIN: cria e edita; acessa auditoria e gestão de usuários.

## Persistência
Google Sheet: `Retrabalho Controle - Unilog`

Abas:
- `RETRABALHOS`
- `USUARIOS` (oculta)
- `AUDITORIA` (oculta)
- `CONFIG` (oculta)

## Apps Script
Crie um projeto Apps Script vinculado ao ambiente desejado e copie os arquivos da pasta `apps-script/`.

Configurar as Script Properties:
- `SPREADSHEET_ID=1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04`
- `GATEWAY_TOKEN=<segredo forte>`
- `AUTH_PASSWORD_PEPPER=<segredo forte e estável>`

Publicar como Web App:
- executar como: usuário que implantou
- acesso: qualquer pessoa

Depois executar manualmente uma única vez:
`bootstrapAdmin('MATRICULA','Nome do Admin','SenhaTemporaria')`

## Cloudflare Pages
Build command:
`npm run build`

Output directory:
`dist`

Variáveis/segredos:
- `APPS_SCRIPT_URL` = URL `/exec` do Web App
- `APPS_SCRIPT_GATEWAY_TOKEN` = mesmo valor de `GATEWAY_TOKEN`
- `APP_SESSION_SECRET` = segredo de sessão com pelo menos 32 caracteres

## Segurança e consistência
- matrícula é identificador de login;
- senha nunca é armazenada em texto puro;
- hash iterativo SHA-256 + salt + pepper;
- cookie JWT HttpOnly/Secure/SameSite=Lax;
- edição protegida por perfil;
- controle otimista por `VERSAO`;
- alterações persistem auditoria antes/depois;
- mutações não possuem retry automático.
