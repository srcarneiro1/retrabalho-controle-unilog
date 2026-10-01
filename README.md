# Retrabalho Controle - Unilog

Aplicação transacional para registrar retrabalho de produtos, quantidades, validade aplicada, etiquetas de Nacionalização/RFID e cobrança histórica por vigência.

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
- `SUPERVISOR`: cria, edita, consulta auditoria e tabela de preços.
- `ADMIN`: cria, edita, consulta auditoria, gerencia usuários e cria novas vigências de preço.
- `CLIENTE`: somente leitura; acompanha informações por competência mensal, consulta auditoria do mês, consulta preços e exporta dados.

A matrícula é o login. Usuários criados pelo ADMIN recebem uma senha temporária e ficam com `TROCA_SENHA_OBRIGATORIA=SIM`. Enquanto essa condição existir, o gateway bloqueia as áreas da aplicação. Após alterar a senha, a sessão é encerrada e o usuário autentica novamente.

## Dados

Google Sheet: **Retrabalho Controle - Unilog**

Abas:
- `RETRABALHOS`
- `USUARIOS` (oculta)
- `AUDITORIA` (oculta)
- `CONFIG` (oculta)
- `TABELA_PRECOS` (oculta)

O cadastro de retrabalho armazena:
- SKU e descrição;
- quantidade retrabalhada;
- data de efetivação;
- validade inserida;
- etiquetas de Nacionalização;
- etiquetas RFID;
- total de etiquetas;
- ID da vigência de preço utilizada;
- preço unitário de Nacionalização;
- preço adicional de RFID;
- valor de Nacionalização;
- valor adicional de RFID;
- valor total da cobrança;
- autor/data de criação;
- autor/data de atualização;
- versão do registro;
- chave `REQUEST_ID` para idempotência.

## Regra financeira

Regra inicial:
- Nacionalização: **R$ 0,40 por etiqueta**.
- RFID: **R$ 0,20 adicionais por etiqueta RFID**.
- Uma unidade com Nacionalização + RFID: **R$ 0,60**.

Fórmula:

```text
Valor total =
(quantidade de etiquetas Nacionalização × preço vigente Nacionalização)
+
(quantidade de etiquetas RFID × preço vigente adicional RFID)
```

A tabela de preços é histórica por vigência.

Quando uma nova vigência é criada:
1. é criada uma nova linha em `TABELA_PRECOS`;
2. a vigência anterior recebe `VIGENCIA_FIM` igual ao dia anterior à nova vigência;
3. a nova vigência precisa começar depois da última vigência existente;
4. preço histórico nunca é sobrescrito;
5. cada lançamento grava uma cópia dos preços unitários e valores calculados no momento do lançamento.

Consequentemente, alteração futura de preço não modifica cobranças históricas.

Se Supervisor/Admin corrigir um lançamento, a cobrança é recalculada usando a tabela histórica correspondente à data de efetivação informada.

## Perfil CLIENTE

O perfil `CLIENTE` é protegido também no gateway.

Regras:
- não pode criar;
- não pode editar;
- não pode gerenciar usuários;
- não pode criar preço;
- deve informar uma competência no formato `AAAA-MM` para consultar retrabalhos;
- auditoria é limitada aos registros de retrabalho daquela competência;
- exportação CSV utiliza somente os dados carregados da competência;
- exportação CSV possui mitigação básica contra CSV/Formula Injection.

A competência inicial utilizada na interface é o mês mais recente com dados. Se não existirem dados, utiliza o mês corrente.

## Consistência e auditoria

- toda edição usa controle otimista por `VERSAO`;
- toda alteração relevante grava snapshot antes/depois na aba `AUDITORIA`;
- criação usa `REQUEST_ID` para evitar duplicação;
- criação de nova vigência também usa `REQUEST_ID`;
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
- perfil CLIENTE: implementado;
- precificação histórica: implementada;
- exportação mensal/auditoria: implementada;
- frontend e gateway: criados no GitHub;
- Apps Script: código criado no repositório;
- build de produção: homologado no GitHub Actions;
- Cloudflare Pages: preparado, ainda depende da conexão/deploy na conta Cloudflare;
- Apps Script Web App: ainda depende da criação/deploy do projeto Apps Script e configuração das Script Properties.
