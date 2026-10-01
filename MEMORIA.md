# Retrabalho Controle — Memória do Projeto

> Sistema Unilog para registro, precificação, auditoria e acompanhamento de retrabalhos por cliente/filial.  
> Esta memória é a fonte de verdade funcional, técnica e visual do projeto e deve ser atualizada sempre que uma decisão aprovada alterar o baseline.

**Atualizado em:** 01/10/2026  
**Produção:** Cloudflare Pages, branch `main`  
**Referência visual:** Extra Cost Control Unilog + BI Logístico V2

### Ajustes e melhorias

O projeto está em evolução contínua. O estado atual é:

- [x] Autenticação por matrícula e senha
- [x] Primeiro acesso com troca obrigatória de senha e renovação transparente da sessão
- [x] Perfis OPERACIONAL, SUPERVISOR, ADMIN e CLIENTE
- [x] Cadastro e vínculo de clientes/filiais por CNPJ
- [x] Relação N:N entre usuários e filiais
- [x] Lançamento e edição de retrabalhos com auditoria
- [x] Precificação histórica por vigência
- [x] Tarifas com 4 casas decimais
- [x] Etiqueta de Validade
- [x] Cancelamento financeiro auditável por SUPERVISOR/ADMIN
- [x] Dashboard CLIENTE por competência
- [x] Filtro CLIENTE por filial/CNPJ e busca local
- [x] Preload do workspace antes de liberar a interface
- [x] Navegação entre abas sem nova leitura desnecessária
- [x] Sidebar expansível/recolhível e drawer mobile
- [x] Favicon e identidade de navegador validados no CI
- [x] Baseline visual PrimeReact alinhado à identidade Unilog
- [ ] Validar visualmente MultiSelect, Calendar e Dialog após o último deploy
- [ ] Refinar o dashboard CLIENTE sem alterar o baseline aprovado

## 💻 Pré-requisitos

Antes de alterar ou publicar o projeto, confirme:

- Node.js 20
- npm
- acesso ao repositório `srcarneiro1/retrabalho-controle-unilog`
- projeto Cloudflare Pages vinculado à branch `main`
- Apps Script vinculado à planilha de produção
- acesso à planilha `Retrabalho Controle - Unilog`
- leitura deste arquivo antes de qualquer alteração estrutural ou visual

Dependências principais:

- Next.js 15.5.25
- React 19.2.8
- PrimeReact 10.9.9
- PrimeIcons
- Google Apps Script
- Google Sheets
- Cloudflare Pages + Pages Functions

## 🚀 Instalando e executando

Instalação local:

```bash
npm install
```

Build de produção:

```bash
npm run build
```

O build executa:

```text
next build
node scripts/copy-next-export.mjs
```

Saída esperada:

```text
dist/
```

O GitHub Actions valida o build antes de considerar a versão segura para deploy.

## ☕ Usando o sistema

### Perfis

**OPERACIONAL**
- cria retrabalhos;
- visualiza apenas filiais vinculadas;
- não edita registros;
- não acessa administração.

**SUPERVISOR**
- cria e edita retrabalhos;
- acessa auditoria e preços;
- pode cancelar cobrança;
- respeita o escopo de filiais vinculadas.

**ADMIN**
- possui todas as permissões do SUPERVISOR;
- administra usuários;
- cria novas vigências de preços;
- sem vínculo explícito de filial, acessa todas as filiais ativas;
- pode ser restringido por vínculos explícitos.

**CLIENTE**
- somente leitura;
- consulta obrigatoriamente por competência `AAAA-MM`;
- pode possuir vários CNPJs do mesmo cliente;
- enxerga apenas CNPJs vinculados;
- usa dashboard mensal com filtro por filial/CNPJ e busca;
- acessa preços, auditoria do período e exportação.

### Primeiro acesso

A senha inicial é temporária.

Quando `TROCA_SENHA_OBRIGATORIA=SIM`:

1. o usuário autentica;
2. permanece na experiência de primeiro acesso;
3. define a nova senha;
4. o backend atualiza a senha;
5. o gateway renova a sessão;
6. o usuário segue autenticado sem logout visual ou novo login manual.

## 🧱 Arquitetura

Fluxo principal:

```text
Browser
  ↓
Cloudflare Pages
  ↓
Pages Functions
  ↓
Google Apps Script
  ↓
Google Sheets
```

Responsabilidades:

- **Next.js/React:** interface e experiência do usuário;
- **Pages Functions:** autenticação, autorização e gateway;
- **Apps Script:** regras de negócio e persistência;
- **Google Sheets:** base operacional e histórica.

### Cloudflare

Configuração:

- build: `npm run build`
- output: `dist`
- produção: branch `main`

Variáveis/segredos:

- `APPS_SCRIPT_URL`
- `APPS_SCRIPT_GATEWAY_TOKEN`
- `APP_SESSION_SECRET`

### Apps Script

Script Properties:

- `SPREADSHEET_ID`
- `GATEWAY_TOKEN`
- `AUTH_PASSWORD_PEPPER`

API health atual:

```text
API_VERSION = 2026.10.01.4
```

A raiz `/exec` e `/exec?route=health` retornam health JSON.

Alterações em `apps-script/*.gs` no GitHub **não atualizam automaticamente** a implantação. Sempre copiar os arquivos alterados para o editor do Apps Script e publicar **nova versão da implantação existente**.

## 🗃️ Base de dados

**Spreadsheet ID**

```text
1Bshvpsh-_gaUx5DX4-PXSLZ3HGXIHluNVKhU8FXFj04
```

Abas:

- `RETRABALHOS`
- `USUARIOS` — oculta
- `AUDITORIA` — oculta
- `CONFIG` — oculta
- `TABELA_PRECOS` — oculta
- `CLIENTES_FILIAIS` — visível
- `USUARIO_FILIAIS` — oculta

### Clientes e filiais

`CLIENTES_FILIAIS` contém:

- CNPJ
- NOME_CLIENTE
- FILIAL
- ATIVO

Regras:

- CNPJ é chave única;
- deve resultar em 14 dígitos após normalização;
- Nome do Cliente e Filial são obrigatórios;
- não apagar filial com histórico;
- para encerrar uso, definir `ATIVO=NAO`;
- filial inativa não recebe novos lançamentos, mas permanece no histórico.

`USUARIO_FILIAIS` implementa a relação N:N matrícula ↔ CNPJ.

`RETRABALHOS` mantém snapshot de:

- `CNPJ_CLIENTE`
- `NOME_CLIENTE`
- `FILIAL`

Renomear um cadastro não altera o histórico já gravado.

## 💰 Preços e cobrança

Regra vigente desde 01/10/2026:

- Nacionalização = **R$ 0,4100**
- RFID adicional = **R$ 0,1900**
- Nacionalização + RFID = **R$ 0,6000**
- Etiqueta de Validade = **R$ 0,4114**

Regras:

- tarifas unitárias são persistidas e exibidas com 4 casas decimais;
- RFID é adicional à Nacionalização;
- quantidade RFID não pode superar quantidade de Nacionalização;
- preços são controlados por vigência em `TABELA_PRECOS`;
- nova vigência deve ser posterior à última;
- histórico de preços nunca é sobrescrito;
- cada retrabalho grava snapshot dos preços utilizados.

Campos financeiros relevantes do retrabalho incluem:

- `ID_PRECO`
- `PRECO_NACIONALIZACAO_UNIT`
- `PRECO_RFID_ADICIONAL_UNIT`
- `PRECO_VALIDADE_UNIT`
- `VALOR_NACIONALIZACAO`
- `VALOR_RFID_ADICIONAL`
- `VALOR_VALIDADE`
- `VALOR_TOTAL_COBRANCA`

### Cancelamento de cobrança

Somente SUPERVISOR e ADMIN.

Regras:

- motivo obrigatório;
- retrabalho não é excluído;
- valor original permanece gravado;
- `valorCobrancaEfetiva = 0` quando cancelado;
- KPIs e exportação usam valor efetivo;
- grava data, matrícula e motivo;
- gera evento `CANCELAR_COBRANCA` em `AUDITORIA`;
- registro cancelado não pode ser editado posteriormente.

## 🔐 Segurança e consistência

- JWT HttpOnly, Secure e SameSite=Lax;
- sessão de 8 horas;
- senha nunca é persistida em texto puro;
- hash iterativo SHA-256 + salt individual + pepper;
- segredos permanecem apenas em Cloudflare/Apps Script;
- `APP_SESSION_SECRET` somente no Cloudflare;
- `AUTH_PASSWORD_PEPPER` somente no Apps Script;
- `APPS_SCRIPT_GATEWAY_TOKEN` deve corresponder ao `GATEWAY_TOKEN`;
- alterações de perfil/status são exclusivas de ADMIN;
- CSV aplica mitigação de Formula Injection.

Consistência:

- edição usa controle otimista por `VERSAO`;
- criação de retrabalho usa `REQUEST_ID`;
- criação de preço usa `REQUEST_ID`;
- histórico usa snapshots antes/depois em `AUDITORIA`;
- nunca executar retry automático de mutação;
- resposta ambígua de mutação deve ser reconciliada por leitura;
- redirect final do ContentService é lido por GET;
- nunca repetir POST no host de conteúdo.

## 🎨 Identidade visual

Fontes de verdade:

- Extra Cost Control: `docs/PRIMEREACT_DESIGN_SYSTEM.md`
- BI Logístico V2: `MEMORIA_IDENTIDADE_VISUAL.md`
- este arquivo para decisões específicas do Retrabalho

Regras canônicas:

- vermelho Unilog: `#db0812`
- hover vermelho: `#b8070f`
- sidebar: gradiente `#171b24 → #202632`
- item ativo: `#303642` + faixa vermelha
- canvas: `#f5f6f8`
- superfície: branco
- borda: `#e2e5e9`
- logo oficial: `/brand/unilog-logo-white-transparent.svg`
- favicon: `/favicon.ico`
- título: `Retrabalho | Unilog Express`
- não permitir azul/índigo visível do tema Lara

Geometria aprovada:

- sidebar desktop expandida: 244 px
- sidebar recolhida: 72 px
- drawer mobile: breakpoint 1100 px
- cards: raio 14 px
- dialogs/popups: raio 14 px
- ações de tabela: compactas e geometricamente iguais
- edição: neutra
- cancelamento: vermelho
- inputs desktop: compactos
- inputs textuais mobile: 16 px para evitar zoom automático do iOS
- overlays PrimeReact: densidade compacta Unilog, sem tipografia ampliada do Lara

### Carregamento do workspace

Após login:

1. carregar módulos permitidos ao perfil;
2. exibir `Preparando seu ambiente`;
3. não mostrar KPIs zerados ou mensagens falsas durante o carregamento;
4. liberar o workspace somente após o bootstrap.

Após o bootstrap:

- trocar entre Lançamentos, Auditoria, Preços e Usuários não dispara nova leitura;
- nova consulta ocorre somente em refresh explícito, mutação ou mudança de competência do CLIENTE.

## 📫 Contribuindo e mantendo o projeto

Antes de alterar:

1. ler esta memória;
2. identificar quais regras/baselines podem ser afetados;
3. comparar com o estado atual da `main`;
4. evitar substituir uma solução aprovada por implementação genérica anterior.

Durante a alteração:

1. fazer mudanças específicas e incrementais;
2. preservar regras de negócio já aprovadas;
3. preservar acessibilidade mobile;
4. preservar identidade visual;
5. não adicionar retry em mutações.

Depois da alteração:

1. executar/validar build;
2. conferir GitHub Actions;
3. confirmar ausência de regressão;
4. atualizar esta memória;
5. registrar a próxima etapa.

## 🛡️ Baseline de não-regressão

Os itens abaixo são sucessos consolidados e não devem retroceder:

- shell/sidebar canônicos;
- topbar full-width e workspace centralizado;
- favicon e título validados pelo CI;
- preload inicial do workspace;
- navegação entre abas sem fetch desnecessário;
- dashboard CLIENTE mensal;
- filtro CLIENTE por filial/CNPJ;
- ações de tabela compactas;
- cancelamento vermelho e auditável;
- precificação de 4 casas decimais;
- relação usuário ↔ filiais;
- mobile sem zoom automático em inputs;
- overlays PrimeReact compactos;
- dialogs com raio e clipping consistentes;
- layout desktop responsivo pela largura útil, sem depender de métricas específicas de Chrome/Edge/Opera;
- primeiro acesso sem novo login manual.

Uma alteração que viole qualquer item acima deve ser considerada regressão até revisão explícita.

## 🗺️ Próxima etapa

- [ ] Validar visualmente o deploy dos overlays `MultiSelect`, `Calendar` e `Dialog` em desktop
- [ ] Validar os mesmos overlays em mobile
- [ ] Confirmar `Criar usuário` compacto no desktop e full-width somente no mobile
- [ ] Validar shell, formulários e tabelas em Chrome, Edge, Opera e Safari
- [ ] Refinar o dashboard CLIENTE mantendo todas as regras acima

## 📝 Registro de decisões

As decisões deste arquivo têm precedência sobre implementações antigas do projeto quando houver conflito.

Ao aprovar uma nova regra:

1. registrar a decisão;
2. atualizar o checklist;
3. atualizar o baseline se ela se tornar um sucesso consolidado;
4. substituir a seção `Próxima etapa` pela nova sequência pendente.

Este arquivo deve permanecer curto o suficiente para leitura operacional, mas completo o suficiente para reconstruir o estado atual do projeto sem depender do histórico do chat.
