# MEMÓRIA — RETRABALHO CONTROLE UNILOG

Criado em 30/09/2026.

## Arquitetura
Next.js 15 + React 19 + PrimeReact/PrimeIcons; Cloudflare Pages; Pages Functions como gateway; Google Apps Script como API/regra de negócio; Google Sheets como persistência.

Referência visual e arquitetural: Extra Cost Control Unilog.

## Regras
- OPERACIONAL cria lançamentos e não edita registros existentes.
- SUPERVISOR cria/edita e consulta auditoria.
- ADMIN cria/edita, consulta auditoria e gerencia usuários.
- matrícula é o login.
- senha temporária deve ser trocada em primeiro acesso; backend preparado com flag `TROCA_SENHA_OBRIGATORIA`.
- toda edição usa controle otimista por `VERSAO`.
- histórico fica em `AUDITORIA`, com snapshot antes/depois.
- nunca adicionar retry automático em mutações.
- Cloudflare deve esconder `GATEWAY_TOKEN`, `AUTH_PASSWORD_PEPPER` nunca vai ao frontend.

## Base
Spreadsheet ID: `1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04`.
Abas: RETRABALHOS, USUARIOS, AUDITORIA, CONFIG.

## Estado
Estrutura inicial criada no Google Sheets e aplicação inicial criada no repositório `srcarneiro1/retrabalho-controle-unilog`.
Ainda falta implantação real do Apps Script e associação do repositório ao Cloudflare Pages para existir ambiente funcional.
