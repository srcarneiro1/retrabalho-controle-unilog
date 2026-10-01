# Retrabalho Controle - Unilog

Aplicação transacional para registrar retrabalho de produtos, quantidades, validade aplicada e etiquetas de Nacionalização/RFID.

## Arquitetura

```text
Usuário
→ Next.js / PrimeReact
→ Cloudflare Pages
→ Pages Functions (JWT + RBAC)
→ Google Apps Script
→ Google Sheets
```

Stack alinhado ao Extra Cost Control Unilog:
- Next.js 15.5.25
- React 19.2.8
- PrimeReact 10.9.9 + PrimeIcons
- Cloudflare Pages + Pages Functions
- Google Apps Script
- Google Sheets

## Perfis

- `OPERACIONAL`: cria lançamentos; não edita registros existentes.
- `SUPERVISOR`: cria, edita e consulta auditoria.
- `ADMIN`: cria, edita, consulta auditoria e gerencia usuários.

A matrícula é o login. Usuários criados pelo ADMIN recebem uma senha temporária e ficam com `TROCA_SENHA_OBRIGATORIA=SIM`. Enquanto essa condição existir, o gateway bloqueia as áreas da aplicação. Após alterar a senha, a sessão é encerrada e o usuário autentica novamente.

## Dados

Google Sheet: **Retrabalho Controle - Unilog**

Abas:
- `RETRABALHOS`
- `USUARIOS` (oculta)
- `AUDITORIA` (oculta)
- `CONFIG` (oculta)

O cadastro de retrabalho armazena:
- SKU e descrição;
- quantidade retrabalhada;
- data de efetivação;
- validade inserida;
- etiquetas de Nacionalização;
- etiquetas RFID;
- total de etiquetas;
- autor/data de criação;
- autor/data de atualização;
- versão do registro;
- chave `REQUEST_ID` para idempotência.

## Consistência e auditoria

- toda edição usa controle otimista por `VERSAO`;
- toda alteração relevante grava snapshot antes/depois na aba `AUDITORIA`;
- criação usa `REQUEST_ID` para evitar duplicação;
- mutações Cloudflare → Apps Script são enviadas exatamente uma vez;
- resposta ambígua de mutação é reconciliada por leitura, sem repetir o POST;
- leituras seguem de forma controlada o redirect do Google ContentService.

## Autenticação

- senha nunca é persistida em texto puro;
- hash iterativo SHA-256 com salt individual e pepper secreto;
- sessão JWT em cookie `HttpOnly; Secure; SameSite=Lax`;
- validade da sessão: 8 horas;
- senha mínima: 8 caracteres;
- mudança de perfil/status exige ADMIN;
- primeiro acesso é bloqueado até troca da senha temporária.

## Apps Script

Copiar/publicar os arquivos de `apps-script/` em um projeto Google Apps Script.

Script Properties obrigatórias:

```text
SPREADSHEET_ID=1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04
GATEWAY_TOKEN=<segredo forte>
AUTH_PASSWORD_PEPPER=<segredo forte e estável>
```

Publicar como Web App:
- executar como: usuário que implantou;
- acesso: qualquer pessoa.

Após configurar as propriedades, executar manualmente uma única vez:

```javascript
bootstrapAdmin('MATRICULA', 'Nome do Admin', 'SenhaTemporaria')
```

O bootstrap é bloqueado automaticamente depois que existir qualquer usuário.

## Cloudflare Pages

Build command:

```text
npm run build
```

Output directory:

```text
dist
```

Variáveis/segredos de produção:

```text
APPS_SCRIPT_URL=<URL /exec do Web App>
APPS_SCRIPT_GATEWAY_TOKEN=<mesmo valor de GATEWAY_TOKEN>
APP_SESSION_SECRET=<segredo aleatório com pelo menos 32 caracteres>
```

Nenhum desses segredos deve ser exposto no bundle React.

## CI

O workflow `.github/workflows/build.yml` executa instalação e build a cada push na `main` e em pull requests.

## Estado da implantação

- estrutura do Google Sheets: criada;
- frontend e gateway: criados no GitHub;
- Apps Script: código criado no repositório;
- Cloudflare Pages: preparado, ainda depende da conexão/deploy na conta Cloudflare;
- Apps Script Web App: ainda depende da criação/deploy do projeto Apps Script e configuração das Script Properties.
