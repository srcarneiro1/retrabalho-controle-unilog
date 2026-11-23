/**
 * Fluxo PHARMAESTETICS (17/11/2026) — lançamentos manuais por NF/EAN, com tarifas próprias.
 * Isolado do fluxo da Acess: grava SOMENTE nas abas PE_* (nenhuma aba existente é alterada) e tem auditoria própria.
 *
 *   PE_FILIAIS      CNPJs que usam este fluxo (precisam existir em CLIENTES_FILIAIS)
 *   PE_PRODUTOS     catálogo de EANs importado do Excel do BI/WMS
 *   PE_IMPORTACOES  histórico das importações do catálogo
 *   PE_PRECOS       vigências das tarifas (DUN-14 por etiqueta, EAN no cartucho por unidade, descarga por pallet)
 *   PE_LANCAMENTOS  um lançamento por NF + EAN (B2B/B2C só classifica; não muda tarifa)
 *   PE_AUDITORIA    histórico de alterações deste fluxo
 */
const PharmaService = (() => {
  const SHEETS = {
    FILIAIS: 'PE_FILIAIS', PRODUTOS: 'PE_PRODUTOS', IMPORTACOES: 'PE_IMPORTACOES', PRECOS: 'PE_PRECOS',
    LANCAMENTOS: 'PE_LANCAMENTOS', AUDITORIA: 'PE_AUDITORIA',
  };
  const HEADERS = {
    PE_FILIAIS: ['CNPJ', 'ATIVO', 'CRIADO_EM', 'MATRICULA_CRIACAO'],
    PE_PRODUTOS: ['EAN', 'DESCRICAO', 'ATIVO', 'ATUALIZADO_EM', 'ID_IMPORTACAO'],
    PE_IMPORTACOES: ['ID_IMPORTACAO', 'ARQUIVO', 'LINHAS', 'NOVOS', 'ATUALIZADOS', 'IGNORADOS', 'CRIADO_EM', 'MATRICULA'],
    PE_PRECOS: ['ID_PRECO', 'VIGENCIA_INICIO', 'VIGENCIA_FIM', 'TARIFA_DUN14', 'TARIFA_EAN_CARTUCHO', 'TARIFA_DESCARGA_PALLET',
      'OBSERVACAO', 'ATIVO', 'VERSAO', 'CRIADO_EM', 'MATRICULA'],
    PE_LANCAMENTOS: ['ID', 'REQUEST_ID', 'ID_LOTE', 'DATA', 'COMPETENCIA', 'CNPJ', 'NOME_CLIENTE', 'FILIAL', 'CANAL', 'NOTA_FISCAL',
      'EAN', 'DESCRICAO', 'QTD_PECAS', 'QTD_DUN14', 'QTD_EAN_CARTUCHO', 'QTD_PALLETS', 'ID_PRECO', 'TARIFA_DUN14',
      'TARIFA_EAN_CARTUCHO', 'TARIFA_DESCARGA_PALLET', 'VALOR_DUN14', 'VALOR_EAN_CARTUCHO', 'VALOR_DESCARGA', 'VALOR_TOTAL',
      'COBRANCA_CANCELADA', 'MOTIVO_CANCELAMENTO', 'ATIVO', 'VERSAO', 'CRIADO_EM', 'MATRICULA_CRIACAO', 'ATUALIZADO_EM',
      'MATRICULA_ATUALIZACAO'],
    PE_AUDITORIA: ['ID_AUDITORIA', 'DATA_HORA', 'MATRICULA', 'ACAO', 'ID_REGISTRO', 'DADOS_ANTES_JSON', 'DADOS_DEPOIS_JSON'],
  };
  const TEXTO = {
    PE_FILIAIS: ['CNPJ'], PE_PRODUTOS: ['EAN'], PE_LANCAMENTOS: ['CNPJ', 'NOTA_FISCAL', 'EAN', 'COMPETENCIA', 'REQUEST_ID'],
    PE_PRECOS: [], PE_IMPORTACOES: [], PE_AUDITORIA: [],
  };
  const MAX_ITENS = 100;
  // Colunas reconhecidas pelo nome (cabeçalhos comparados sem acento, espaço ou pontuação). Primeiro os nomes exatos,
  // em ordem de preferência; depois aproximações. Relatório de ocupação do WMS/BI (17/11/2026): "Produto Codigo" = EAN e
  // "Produto" = descrição — e "Descrição Classe" (situação do estoque) NUNCA é usada como descrição do produto.
  const EAN_EXATOS = ['EAN', 'CODIGOEAN', 'EAN13', 'GTIN', 'CODIGODEBARRAS', 'CODDEBARRAS', 'PRODUTOCODIGO', 'CODIGOPRODUTO', 'CODPRODUTO'];
  const DESCRICAO_EXATOS = ['DESCRICAO', 'DESCRICAOPRODUTO', 'DESCRICAODOPRODUTO', 'PRODUTO', 'NOMEPRODUTO', 'NOMEDOPRODUTO'];
  function coluna_(cab, exatos, aproximada) {
    for (let i = 0; i < exatos.length; i++) { const k = cab.indexOf(exatos[i]); if (k >= 0) return k; }
    return cab.findIndex(aproximada);
  }
  function colunaEan_(cab) { return coluna_(cab, EAN_EXATOS, h => h.indexOf('EAN') >= 0 || h.indexOf('GTIN') >= 0); }
  function colunaDescricao_(cab) { return coluna_(cab, DESCRICAO_EXATOS, h => h.indexOf('DESCR') === 0 && h.indexOf('CLASSE') < 0); }
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XLS_MIME = 'application/vnd.ms-excel';

  // ---------- utilitários ----------
  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }
  function fail_(m) { throw new Error(m); }
  function now_() { return new Date(); }
  function cnpj_(v) { return text_(v).replace(/\D/g, '').padStart(14, '0').slice(-14); }
  function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }
  function int_(v, label, min) {
    const t = text_(v);
    const n = t === '' ? 0 : Number(t);
    if (!Number.isInteger(n) || n < min) fail_(label + ' inválida.');
    return n;
  }
  function tarifa_(v, label) {
    const n = Number(String(v == null ? '' : v).replace(',', '.'));
    if (!isFinite(n) || n < 0) fail_(label + ' inválida.');
    return Math.round(n * 10000) / 10000;
  }
  function ymd_(v) {
    if (v instanceof Date) return Utilities.formatDate(v, AppConfig.TIMEZONE, 'yyyy-MM-dd');
    const t = text_(v);
    const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const iso = br ? br[3] + '-' + br[2] + '-' + br[1] : t.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) fail_('Data inválida.');
    return iso;
  }
  function header_(v) {
    return text_(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function ean_(v) {
    if (typeof v === 'number') return String(Math.round(v));
    return text_(v).replace(/\.0+$/, '').replace(/\s/g, '');
  }
  function id_(prefixo) {
    return prefixo + '-' + Utilities.formatDate(now_(), AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  }
  /** Linhas de uma aba como objetos planos com o número da linha em _row (Repository.list devolve {rowNumber, record}). */
  function linhas_(nome) {
    return Repository.list(nome).map(x => Object.assign({ _row: x.rowNumber }, x.record));
  }
  function ensure_() {
    Object.keys(HEADERS).forEach(name => Repository.ensure(name, HEADERS[name]));
  }
  function audit_(matricula, acao, id, antes, depois) {
    Repository.append(SHEETS.AUDITORIA, {
      ID_AUDITORIA: id_('PA'), DATA_HORA: now_(), MATRICULA: text_(matricula), ACAO: acao, ID_REGISTRO: id,
      DADOS_ANTES_JSON: antes ? JSON.stringify(antes) : '', DADOS_DEPOIS_JSON: depois ? JSON.stringify(depois) : '',
    }, []);
  }

  // ---------- perfis ----------
  function perfil_(p) { return upper_(p); }
  function podeLancar_(p) { return ['ADMIN', 'SUPERVISOR', 'OPERACIONAL'].indexOf(perfil_(p)) >= 0; }
  function exigir_(cond, m) { if (!cond) fail_(m); }

  // ---------- filiais do fluxo ----------
  function filiaisPharma_() {
    const set = {};
    linhas_(SHEETS.FILIAIS).forEach(r => { if (upper_(r.ATIVO) !== 'NAO' && text_(r.CNPJ)) set[cnpj_(r.CNPJ)] = true; });
    return set;
  }
  /** Filiais deste fluxo dentro do escopo do usuário (o escopo vem de ClientBranchService, sem alteração). */
  function filiaisDoUsuario_(matricula, perfil) {
    const pharma = filiaisPharma_();
    return ClientBranchService.availableForUser(matricula, perfil).filter(f => pharma[f.cnpj]);
  }
  function filialParaGravar_(matricula, perfil, cnpj) {
    const alvo = cnpj_(cnpj);
    if (!filiaisPharma_()[alvo]) fail_('Esta filial não está habilitada para o fluxo PHARMAESTETICS.');
    return ClientBranchService.assertAllowed(matricula, perfil, alvo);
  }

  // ---------- catálogo ----------
  function catalogo_() {
    const map = {};
    linhas_(SHEETS.PRODUTOS).forEach(r => {
      const e = ean_(r.EAN);
      if (e && upper_(r.ATIVO) !== 'NAO') map[e] = text_(r.DESCRICAO);
    });
    return map;
  }

  /** Lê as abas do Excel convertendo pelo Drive (mesmo caminho usado na importação de processos). */
  function valoresExcel_(blob, nome) {
    const convertido = Drive.Files.create({ name: 'tmp-catalogo-pharma-' + nome, mimeType: MimeType.GOOGLE_SHEETS }, blob);
    try {
      return SpreadsheetApp.openById(convertido.id).getSheets().map(s => s.getDataRange().getValues());
    } finally {
      try { Drive.Files.remove(convertido.id); } catch (e) { DriveApp.getFileById(convertido.id).setTrashed(true); }
    }
  }

  /** Localiza as colunas de EAN e descrição pelo nome (nas 20 primeiras linhas) e extrai os produtos. */
  function extrairProdutos_(abas) {
    for (let a = 0; a < abas.length; a++) {
      const linhas = abas[a];
      for (let r = 0; r < Math.min(linhas.length, 20); r++) {
        const cab = linhas[r].map(header_);
        const iEan = colunaEan_(cab);
        const iDesc = colunaDescricao_(cab);
        if (iEan < 0 || iDesc < 0) continue;
        const itens = {}; let ignorados = 0; let total = 0;
        for (let i = r + 1; i < linhas.length; i++) {
          const e = ean_(linhas[i][iEan]); const d = text_(linhas[i][iDesc]);
          if (!e && !d) continue;
          total++;
          if (!/^\d{8,14}$/.test(e) || !d) { ignorados++; continue; }
          itens[e] = d;
        }
        return { itens: itens, ignorados: ignorados, total: total };
      }
    }
    const vistos = abas.length && abas[0].length ? abas[0][0].map(text_).filter(Boolean).join(', ') : '(vazio)';
    fail_('Não encontrei as colunas de EAN e descrição. Colunas da primeira linha: ' + vistos + '.');
  }

  function importarProdutos(input) {
    const p = perfil_(input.perfilAutor);
    exigir_(p === 'ADMIN' || p === 'SUPERVISOR', 'Somente SUPERVISOR e ADMIN importam o catálogo.');
    ensure_();
    const nome = text_(input.nomeArquivo) || 'catalogo.xlsx';
    const ext = nome.toLowerCase().split('.').pop();
    exigir_(ext === 'xlsx' || ext === 'xls', 'Envie o arquivo em Excel (.xlsx ou .xls).');
    const bytes = Utilities.base64Decode(text_(input.conteudoBase64));
    exigir_(bytes.length > 0 && bytes.length <= 10 * 1024 * 1024, 'Arquivo vazio ou acima de 10 MB.');
    const lidos = extrairProdutos_(valoresExcel_(Utilities.newBlob(bytes, ext === 'xls' ? XLS_MIME : XLSX_MIME, nome), nome));
    const eans = Object.keys(lidos.itens);
    exigir_(eans.length > 0, 'Nenhum produto com EAN (8 a 14 dígitos) e descrição foi encontrado.');
    const idImportacao = id_('PI');
    const existentes = {};
    linhas_(SHEETS.PRODUTOS).forEach(r => { existentes[ean_(r.EAN)] = r; });
    const novos = []; const alteracoes = [];
    eans.forEach(e => {
      const atual = existentes[e];
      if (!atual) novos.push({ EAN: e, DESCRICAO: lidos.itens[e], ATIVO: 'SIM', ATUALIZADO_EM: now_(), ID_IMPORTACAO: idImportacao });
      else if (text_(atual.DESCRICAO) !== lidos.itens[e] || upper_(atual.ATIVO) === 'NAO') {
        alteracoes.push({ rowNumber: atual._row, updates: { DESCRICAO: lidos.itens[e], ATIVO: 'SIM', ATUALIZADO_EM: now_(), ID_IMPORTACAO: idImportacao } });
      }
    });
    if (novos.length) Repository.appendMany(SHEETS.PRODUTOS, novos, TEXTO.PE_PRODUTOS);
    if (alteracoes.length) Repository.updateMany(SHEETS.PRODUTOS, alteracoes, TEXTO.PE_PRODUTOS);
    const resumo = { idImportacao: idImportacao, arquivo: nome, linhas: lidos.total, novos: novos.length, atualizados: alteracoes.length, ignorados: lidos.ignorados };
    Repository.append(SHEETS.IMPORTACOES, { ID_IMPORTACAO: idImportacao, ARQUIVO: nome, LINHAS: lidos.total, NOVOS: novos.length,
      ATUALIZADOS: alteracoes.length, IGNORADOS: lidos.ignorados, CRIADO_EM: now_(), MATRICULA: text_(input.matriculaAutor) }, []);
    audit_(input.matriculaAutor, 'IMPORTAR_CATALOGO', idImportacao, null, resumo);
    return resumo;
  }

  // ---------- tarifas ----------
  function precos_() {
    return linhas_(SHEETS.PRECOS).filter(r => upper_(r.ATIVO) !== 'NAO').map(r => ({
      id: text_(r.ID_PRECO), inicio: ymd_(r.VIGENCIA_INICIO), fim: text_(r.VIGENCIA_FIM) ? ymd_(r.VIGENCIA_FIM) : '',
      dun14: Number(r.TARIFA_DUN14), eanCartucho: Number(r.TARIFA_EAN_CARTUCHO), descargaPallet: Number(r.TARIFA_DESCARGA_PALLET),
      observacao: text_(r.OBSERVACAO), versao: Number(r.VERSAO) || 1, _row: r._row,
    })).sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  function precoDaData_(data) {
    const lista = precos_();
    for (let i = lista.length - 1; i >= 0; i--) {
      if (lista[i].inicio <= data && (!lista[i].fim || data <= lista[i].fim)) return lista[i];
    }
    fail_('Não existe tarifa PHARMAESTETICS vigente para a data ' + data.split('-').reverse().join('/') + '.');
  }
  function criarVigencia(input) {
    exigir_(perfil_(input.perfilAutor) === 'ADMIN', 'Somente ADMIN altera as tarifas.');
    ensure_();
    const inicio = ymd_(input.vigenciaInicio);
    const lista = precos_();
    const ultima = lista[lista.length - 1];
    if (ultima && inicio <= ultima.inicio) fail_('A nova vigência deve começar depois de ' + ultima.inicio.split('-').reverse().join('/') + '.');
    const nova = { ID_PRECO: 'PP-' + inicio.replace(/-/g, '') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase(), VIGENCIA_INICIO: inicio,
      VIGENCIA_FIM: '', TARIFA_DUN14: tarifa_(input.dun14, 'Tarifa DUN-14'), TARIFA_EAN_CARTUCHO: tarifa_(input.eanCartucho, 'Tarifa EAN no cartucho'),
      TARIFA_DESCARGA_PALLET: tarifa_(input.descargaPallet, 'Tarifa de descarga por pallet'), OBSERVACAO: text_(input.observacao),
      ATIVO: 'SIM', VERSAO: 1, CRIADO_EM: now_(), MATRICULA: text_(input.matriculaAutor) };
    if (ultima && !ultima.fim) {
      const d = new Date(inicio + 'T12:00:00'); d.setDate(d.getDate() - 1);
      Repository.update(SHEETS.PRECOS, ultima._row, { VIGENCIA_FIM: Utilities.formatDate(d, AppConfig.TIMEZONE, 'yyyy-MM-dd'), VERSAO: ultima.versao + 1 }, []);
    }
    Repository.append(SHEETS.PRECOS, nova, []);
    audit_(input.matriculaAutor, 'CRIAR_VIGENCIA', nova.ID_PRECO, null, nova);
    return { id: nova.ID_PRECO };
  }

  // ---------- lançamentos ----------
  function canal_(v) {
    const c = upper_(v);
    if (c !== 'B2B' && c !== 'B2C') fail_('Marque B2B ou B2C.');
    return c;
  }
  function servicos_(item, rotulo) {
    const pecas = int_(item.qtdPecas, rotulo + 'Quantidade de peças', 1);
    const dun14 = int_(item.qtdDun14, rotulo + 'Quantidade de etiquetas DUN-14', 0);
    const ean = int_(item.qtdEanCartucho, rotulo + 'Quantidade de EAN no cartucho', 0);
    const pallets = int_(item.qtdPallets, rotulo + 'Quantidade de pallets', 0);
    if (ean > pecas) fail_(rotulo + 'EAN no cartucho não pode ser maior que a quantidade de peças.');
    if (dun14 + ean + pallets === 0) fail_(rotulo + 'Informe ao menos um serviço (DUN-14, EAN no cartucho ou pallets).');
    return { pecas: pecas, dun14: dun14, ean: ean, pallets: pallets };
  }
  function cobranca_(s, preco) {
    const vDun = round2_(s.dun14 * preco.dun14), vEan = round2_(s.ean * preco.eanCartucho), vDesc = round2_(s.pallets * preco.descargaPallet);
    return { ID_PRECO: preco.id, TARIFA_DUN14: preco.dun14, TARIFA_EAN_CARTUCHO: preco.eanCartucho, TARIFA_DESCARGA_PALLET: preco.descargaPallet,
      VALOR_DUN14: vDun, VALOR_EAN_CARTUCHO: vEan, VALOR_DESCARGA: vDesc, VALOR_TOTAL: round2_(vDun + vEan + vDesc) };
  }

  /** Uma NF com um ou vários EANs, tudo ou nada; idempotente por requestId (reenvio devolve o já gravado). */
  function criarLote(input) {
    exigir_(podeLancar_(input.perfilAutor), 'Perfil CLIENTE é somente leitura.');
    ensure_();
    const requestId = text_(input.requestId);
    exigir_(requestId, 'Identificador da requisição ausente.');
    const anteriores = linhas_(SHEETS.LANCAMENTOS).filter(r => text_(r.REQUEST_ID).indexOf(requestId + ':') === 0);
    if (anteriores.length) return { idLote: text_(anteriores[0].ID_LOTE), lancamentos: anteriores.length, repetido: true };
    const filial = filialParaGravar_(input.matriculaAutor, input.perfilAutor, input.cnpj);
    const canal = canal_(input.canal);
    const nf = text_(input.notaFiscal);
    exigir_(nf && nf.length <= 30, 'Informe a nota fiscal (até 30 caracteres).');
    const data = ymd_(input.data);
    const itens = Array.isArray(input.itens) ? input.itens : [];
    exigir_(itens.length > 0, 'Inclua ao menos um EAN.');
    exigir_(itens.length <= MAX_ITENS, 'No máximo ' + MAX_ITENS + ' EANs por lançamento.');
    const catalogo = catalogo_();
    const preco = precoDaData_(data);
    const vistos = {};
    const idLote = id_('PL');
    const registros = itens.map((item, i) => {
      const rotulo = 'Linha ' + (i + 1) + ': ';
      const ean = ean_(item.ean);
      if (!catalogo[ean]) fail_(rotulo + 'EAN ' + (ean || '(vazio)') + ' não está no catálogo PHARMAESTETICS.');
      if (vistos[ean]) fail_(rotulo + 'EAN ' + ean + ' repetido nesta nota.');
      vistos[ean] = true;
      const s = servicos_(item, rotulo);
      return Object.assign({ ID: id_('PE'), REQUEST_ID: requestId + ':' + (i + 1), ID_LOTE: idLote, DATA: data, COMPETENCIA: data.slice(0, 7),
        CNPJ: filial.cnpj, NOME_CLIENTE: filial.nomeCliente, FILIAL: filial.filial, CANAL: canal, NOTA_FISCAL: nf, EAN: ean,
        DESCRICAO: catalogo[ean], QTD_PECAS: s.pecas, QTD_DUN14: s.dun14, QTD_EAN_CARTUCHO: s.ean, QTD_PALLETS: s.pallets,
        COBRANCA_CANCELADA: 'NAO', MOTIVO_CANCELAMENTO: '', ATIVO: 'SIM', VERSAO: 1, CRIADO_EM: now_(),
        MATRICULA_CRIACAO: text_(input.matriculaAutor), ATUALIZADO_EM: '', MATRICULA_ATUALIZACAO: '' }, cobranca_(s, preco));
    });
    Repository.appendMany(SHEETS.LANCAMENTOS, registros, TEXTO.PE_LANCAMENTOS);
    registros.forEach(r => audit_(input.matriculaAutor, 'CRIAR', r.ID, null, r));
    return { idLote: idLote, lancamentos: registros.length, repetido: false };
  }

  function registro_(id) {
    const r = linhas_(SHEETS.LANCAMENTOS).find(x => text_(x.ID) === text_(id));
    if (!r) fail_('Lançamento não encontrado.');
    return r;
  }
  function conferir_(atual, input) {
    ClientBranchService.assertAllowed(input.matriculaAutor, input.perfilAutor, atual.CNPJ);
    if (upper_(atual.COBRANCA_CANCELADA) === 'SIM') fail_('A cobrança deste lançamento foi cancelada; ele não pode ser alterado.');
    if (Number(input.versao) !== Number(atual.VERSAO)) fail_('O lançamento foi alterado por outro usuário. Atualize a lista e tente novamente.');
  }

  function editar(input) {
    const p = perfil_(input.perfilAutor);
    exigir_(podeLancar_(p), 'Seu perfil não pode editar lançamentos.');
    const atual = registro_(input.id);
    conferir_(atual, input);
    const s = servicos_(input, '');
    const mudancas = { QTD_PECAS: s.pecas, QTD_DUN14: s.dun14, QTD_EAN_CARTUCHO: s.ean, QTD_PALLETS: s.pallets };
    let data = ymd_(atual.DATA);
    if (p !== 'OPERACIONAL') {
      // SUPERVISOR/ADMIN também corrigem data, canal e nota; o EAN não muda (exclua e lance de novo).
      if (input.data) data = ymd_(input.data);
      if (input.canal) mudancas.CANAL = canal_(input.canal);
      if (input.notaFiscal) { const nf = text_(input.notaFiscal); exigir_(nf.length <= 30, 'Nota fiscal com até 30 caracteres.'); mudancas.NOTA_FISCAL = nf; }
    } else if ((input.data && ymd_(input.data) !== data) || (input.canal && canal_(input.canal) !== upper_(atual.CANAL))
      || (input.notaFiscal && text_(input.notaFiscal) !== text_(atual.NOTA_FISCAL))) {
      fail_('Seu perfil pode alterar apenas as quantidades do lançamento.');
    }
    Object.assign(mudancas, { DATA: data, COMPETENCIA: data.slice(0, 7) }, cobranca_(s, precoDaData_(data)),
      { VERSAO: Number(atual.VERSAO) + 1, ATUALIZADO_EM: now_(), MATRICULA_ATUALIZACAO: text_(input.matriculaAutor) });
    Repository.update(SHEETS.LANCAMENTOS, atual._row, mudancas, TEXTO.PE_LANCAMENTOS);
    audit_(input.matriculaAutor, 'EDITAR', atual.ID, limpo_(atual), mudancas);
    return { id: text_(atual.ID), versao: mudancas.VERSAO };
  }

  function cancelar(input) {
    const p = perfil_(input.perfilAutor);
    exigir_(p === 'ADMIN' || p === 'SUPERVISOR', 'Somente SUPERVISOR e ADMIN cancelam uma cobrança.');
    const motivo = text_(input.motivo);
    exigir_(motivo, 'Informe o motivo do cancelamento.');
    const atual = registro_(input.id);
    conferir_(atual, input);
    const mudancas = { COBRANCA_CANCELADA: 'SIM', MOTIVO_CANCELAMENTO: motivo, VERSAO: Number(atual.VERSAO) + 1, ATUALIZADO_EM: now_(),
      MATRICULA_ATUALIZACAO: text_(input.matriculaAutor) };
    Repository.update(SHEETS.LANCAMENTOS, atual._row, mudancas, []);
    audit_(input.matriculaAutor, 'CANCELAR', atual.ID, limpo_(atual), mudancas);
    return { id: text_(atual.ID), versao: mudancas.VERSAO };
  }

  function limpo_(r) { const c = Object.assign({}, r); delete c._row; return c; }

  function mapa_(r) {
    return { id: text_(r.ID), idLote: text_(r.ID_LOTE), data: ymd_(r.DATA), competencia: text_(r.COMPETENCIA), cnpj: cnpj_(r.CNPJ),
      nomeCliente: text_(r.NOME_CLIENTE), filial: text_(r.FILIAL), canal: upper_(r.CANAL), notaFiscal: text_(r.NOTA_FISCAL),
      ean: ean_(r.EAN), descricao: text_(r.DESCRICAO), qtdPecas: Number(r.QTD_PECAS) || 0, qtdDun14: Number(r.QTD_DUN14) || 0,
      qtdEanCartucho: Number(r.QTD_EAN_CARTUCHO) || 0, qtdPallets: Number(r.QTD_PALLETS) || 0, idPreco: text_(r.ID_PRECO),
      tarifaDun14: Number(r.TARIFA_DUN14) || 0, tarifaEanCartucho: Number(r.TARIFA_EAN_CARTUCHO) || 0,
      tarifaDescargaPallet: Number(r.TARIFA_DESCARGA_PALLET) || 0, valorDun14: Number(r.VALOR_DUN14) || 0,
      valorEanCartucho: Number(r.VALOR_EAN_CARTUCHO) || 0, valorDescarga: Number(r.VALOR_DESCARGA) || 0, valorTotal: Number(r.VALOR_TOTAL) || 0,
      cobrancaCancelada: upper_(r.COBRANCA_CANCELADA) === 'SIM', motivoCancelamento: text_(r.MOTIVO_CANCELAMENTO),
      versao: Number(r.VERSAO) || 1, criadoPor: text_(r.MATRICULA_CRIACAO), criadoEm: r.CRIADO_EM instanceof Date ? r.CRIADO_EM.toISOString() : text_(r.CRIADO_EM) };
  }

  /** Lançamentos da competência nas filiais PHARMAESTETICS do escopo do usuário (CLIENTE consulta as suas). */
  function listar(input) {
    ensure_();
    const mes = text_(input.mes);
    exigir_(/^\d{4}-\d{2}$/.test(mes), 'Informe a competência (AAAA-MM).');
    const permitidas = {};
    filiaisDoUsuario_(input.matriculaAutor, input.perfilAutor).forEach(f => { permitidas[f.cnpj] = true; });
    return linhas_(SHEETS.LANCAMENTOS)
      .filter(r => upper_(r.ATIVO) !== 'NAO' && text_(r.COMPETENCIA) === mes && permitidas[cnpj_(r.CNPJ)])
      .map(mapa_).sort((a, b) => (b.data + b.criadoEm).localeCompare(a.data + a.criadoEm));
  }

  function meses(input) {
    ensure_();
    const permitidas = {};
    filiaisDoUsuario_(input.matriculaAutor, input.perfilAutor).forEach(f => { permitidas[f.cnpj] = true; });
    const set = {};
    linhas_(SHEETS.LANCAMENTOS).forEach(r => { if (permitidas[cnpj_(r.CNPJ)] && text_(r.COMPETENCIA)) set[text_(r.COMPETENCIA)] = true; });
    return Object.keys(set).sort().reverse();
  }

  /** Dados para as telas: filiais do fluxo no escopo, catálogo, tarifas e permissões do perfil. */
  function config(input) {
    ensure_();
    const p = perfil_(input.perfilAutor);
    const hoje = Utilities.formatDate(now_(), AppConfig.TIMEZONE, 'yyyy-MM-dd');
    const catalogo = catalogo_();
    let vigente = null;
    try { vigente = precoDaData_(hoje); } catch (e) { vigente = null; }
    return {
      filiais: filiaisDoUsuario_(input.matriculaAutor, p),
      produtos: Object.keys(catalogo).sort().map(e => ({ ean: e, descricao: catalogo[e] })),
      tarifas: precos_().map(x => ({ id: x.id, inicio: x.inicio, fim: x.fim, dun14: x.dun14, eanCartucho: x.eanCartucho, descargaPallet: x.descargaPallet, observacao: x.observacao })),
      tarifaVigente: vigente ? { id: vigente.id, dun14: vigente.dun14, eanCartucho: vigente.eanCartucho, descargaPallet: vigente.descargaPallet } : null,
      importacoes: linhas_(SHEETS.IMPORTACOES).slice(-5).reverse().map(r => ({ arquivo: text_(r.ARQUIVO), novos: Number(r.NOVOS) || 0,
        atualizados: Number(r.ATUALIZADOS) || 0, ignorados: Number(r.IGNORADOS) || 0, em: r.CRIADO_EM instanceof Date ? r.CRIADO_EM.toISOString() : text_(r.CRIADO_EM) })),
      permissoes: { lancar: podeLancar_(p), cancelar: p === 'ADMIN' || p === 'SUPERVISOR', importar: p === 'ADMIN' || p === 'SUPERVISOR', tarifas: p === 'ADMIN' },
    };
  }

  /** ADMIN habilita uma filial (já cadastrada em CLIENTES_FILIAIS) para este fluxo. */
  function habilitarFilial(input) {
    exigir_(perfil_(input.perfilAutor) === 'ADMIN', 'Somente ADMIN habilita filiais.');
    ensure_();
    const alvo = cnpj_(input.cnpj);
    const existe = ClientBranchService.availableForUser(input.matriculaAutor, 'ADMIN').some(f => f.cnpj === alvo);
    exigir_(existe, 'CNPJ não encontrado entre as filiais ativas. Cadastre a filial antes.');
    if (filiaisPharma_()[alvo]) return { cnpj: alvo, jaHabilitada: true };
    Repository.append(SHEETS.FILIAIS, { CNPJ: alvo, ATIVO: 'SIM', CRIADO_EM: now_(), MATRICULA_CRIACAO: text_(input.matriculaAutor) }, TEXTO.PE_FILIAIS);
    audit_(input.matriculaAutor, 'HABILITAR_FILIAL', alvo, null, { cnpj: alvo });
    return { cnpj: alvo, jaHabilitada: false };
  }

  return { SHEETS, HEADERS, ensure: ensure_, linhas: linhas_, config, importarProdutos, criarVigencia, criarLote, editar, cancelar, listar, meses,
    habilitarFilial, _extrairProdutos: extrairProdutos_ };
})();

/**
 * Executar UMA VEZ no editor (script de teste, depois o de produção): cria as abas PE_* e a primeira vigência de
 * tarifas (R$ 0,80 DUN-14 por etiqueta; R$ 0,60 EAN no cartucho por unidade; R$ 12,00 descarga por pallet).
 * Ajuste VIGENCIA_INICIO abaixo antes de executar. Não altera nenhuma aba existente.
 */
function setupPharmaEstetics() {
  const VIGENCIA_INICIO = '2026-11-01';
  PharmaService.ensure();
  const temPreco = PharmaService.linhas(PharmaService.SHEETS.PRECOS).length > 0;
  if (!temPreco) {
    Repository.append(PharmaService.SHEETS.PRECOS, { ID_PRECO: 'PP-' + VIGENCIA_INICIO.replace(/-/g, '') + '-INICIAL', VIGENCIA_INICIO: VIGENCIA_INICIO,
      VIGENCIA_FIM: '', TARIFA_DUN14: 0.8, TARIFA_EAN_CARTUCHO: 0.6, TARIFA_DESCARGA_PALLET: 12, OBSERVACAO: 'Tarifas iniciais (proposta comercial)',
      ATIVO: 'SIM', VERSAO: 1, CRIADO_EM: new Date(), MATRICULA: 'setup' }, []);
  }
  console.log('Abas PE_* prontas. Tarifa inicial ' + (temPreco ? 'já existia.' : 'criada a partir de ' + VIGENCIA_INICIO + '.'));
}

/**
 * Remove os lançamentos de TESTE (nota fiscal começando com "TESTE") antes da entrada em produção.
 * Executar no editor. Marca ATIVO=NAO (não apaga linhas) e registra na auditoria do fluxo.
 */
function limparTestesPharmaEstetics() {
  const linhas = PharmaService.linhas(PharmaService.SHEETS.LANCAMENTOS)
    .filter(r => String(r.NOTA_FISCAL || '').toUpperCase().indexOf('TESTE') === 0 && String(r.ATIVO || '').toUpperCase() !== 'NAO');
  if (linhas.length) Repository.updateMany(PharmaService.SHEETS.LANCAMENTOS, linhas.map(r => ({ rowNumber: r._row, updates: { ATIVO: 'NAO' } })), []);
  console.log(linhas.length + ' lançamento(s) de teste desativado(s).');
}
