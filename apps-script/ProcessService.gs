const ProcessService = (() => {
  const PROC = 'PROCESSOS';
  const SKUS = 'PROCESSO_SKUS';
  const PROC_HEADERS = [
    'ID_PROCESSO',
    'NUMERO_PROCESSO',
    'CNPJ_CLIENTE',
    'NOME_CLIENTE',
    'FILIAL',
    'ARQUIVO_ID',
    'ARQUIVO_NOME',
    'ARQUIVO_URL',
    'QTD_SKUS',
    'QTD_IGNORADOS',
    'MATRICULA_CRIACAO',
    'CRIADO_EM',
    'VERSAO',
    'ATIVO',
    'REQUEST_ID'
  ];
  const SKU_HEADERS = ['ID_PROCESSO', 'NUMERO_PROCESSO', 'SKU', 'DESCRICAO'];

  // Colunas da planilha do cliente (comparadas sem acento, espaço ou pontuação).
  const SKU_COLUMN = 'CODDEBARRAS';          // "CÓD DE BARRAS"
  const DESCRIPTION_COLUMN = 'DESCRICAOANVISA'; // "DESCRICAO ANVISA"
  const HEADER_SEARCH_ROWS = 30;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XLS_MIME = 'application/vnd.ms-excel';

  const skuCache_ = {};

  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }

  function normalizeHeader_(v) {
    return text_(v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  // Código de barras lido como número pelo Sheets vira "7891234567890" (sem notação científica).
  function skuText_(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(0);
    return text_(v).replace(/\.0+$/, '');
  }

  function dt_(v) {
    if (!v) return '';
    const d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(v);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  }

  function ensureSheets_() {
    Repository.ensure(PROC, PROC_HEADERS);
    Repository.ensure(SKUS, SKU_HEADERS);
  }

  function assertInternal_(perfil) {
    if (perfil === 'CLIENTE') throw new Error('O perfil CLIENTE não acessa os processos.');
  }

  function allowedSet_(matricula, perfil) {
    const set = {};
    ClientBranchService.scopeCnpjs(matricula, perfil).forEach(cnpj => { set[cnpj] = true; });
    return set;
  }

  function map_(r) {
    return {
      id: text_(r.ID_PROCESSO),
      requestId: text_(r.REQUEST_ID),
      numero: text_(r.NUMERO_PROCESSO),
      cnpjCliente: text_(r.CNPJ_CLIENTE).replace(/\D/g, ''),
      nomeCliente: text_(r.NOME_CLIENTE),
      filial: text_(r.FILIAL),
      arquivoNome: text_(r.ARQUIVO_NOME),
      arquivoUrl: text_(r.ARQUIVO_URL),
      qtdSkus: Number(r.QTD_SKUS || 0),
      qtdIgnorados: Number(r.QTD_IGNORADOS || 0),
      matriculaCriacao: text_(r.MATRICULA_CRIACAO),
      criadoEm: dt_(r.CRIADO_EM),
      versao: Number(r.VERSAO || 0)
    };
  }

  function active_() {
    ensureSheets_();
    return Repository.list(PROC).filter(x => upper_(x.record.ATIVO) !== 'NAO');
  }

  function list(matricula, perfil) {
    const profile = upper_(perfil);
    assertInternal_(profile);
    const allowed = allowedSet_(text_(matricula), profile);
    return active_()
      .map(x => map_(x.record))
      .filter(p => Boolean(allowed[p.cnpjCliente]))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  // Processo no escopo do usuário (lança erro se não existir ou não tiver acesso).
  function get(idProcesso, matricula, perfil) {
    const profile = upper_(perfil);
    assertInternal_(profile);
    const id = text_(idProcesso);
    if (!id) throw new Error('Selecione o número do processo.');
    const hit = active_().find(x => text_(x.record.ID_PROCESSO) === id);
    if (!hit) throw new Error('Processo não encontrado ou inativo.');
    const process = map_(hit.record);
    if (!allowedSet_(text_(matricula), profile)[process.cnpjCliente]) {
      throw new Error('Você não possui acesso a este processo.');
    }
    return process;
  }

  // Mapa SKU → descrição de um processo (cacheado dentro da mesma execução).
  function catalog_(idProcesso) {
    if (skuCache_[idProcesso]) return skuCache_[idProcesso];
    ensureSheets_();
    const map = {};
    Repository.list(SKUS).forEach(x => {
      if (text_(x.record.ID_PROCESSO) !== idProcesso) return;
      const sku = skuText_(x.record.SKU);
      if (sku && !map[sku]) map[sku] = text_(x.record.DESCRICAO);
    });
    skuCache_[idProcesso] = map;
    return map;
  }

  function skus(idProcesso, matricula, perfil) {
    const process = get(idProcesso, matricula, perfil);
    const map = catalog_(process.id);
    return Object.keys(map)
      .map(sku => ({ sku, descricao: map[sku] }))
      .sort((a, b) => a.descricao.localeCompare(b.descricao) || a.sku.localeCompare(b.sku));
  }

  // Descrição oficial do SKU no processo; null se o SKU não pertence ao processo.
  function describe(idProcesso, sku) {
    const map = catalog_(text_(idProcesso));
    const key = skuText_(sku);
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  // ---------- Leitura da planilha enviada ----------

  function extension_(name) {
    const match = /\.([a-z0-9]+)$/i.exec(text_(name));
    return match ? match[1].toLowerCase() : '';
  }

  function valuesFromCsv_(blob) {
    const content = blob.getDataAsString('UTF-8').replace(/^\uFEFF/, '');
    const firstLine = content.split(/\r?\n/)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    return [Utilities.parseCsv(content, delimiter)];
  }

  // Excel: convertido temporariamente em Planilha Google para leitura confiável
  // (requer o serviço avançado "Drive API" habilitado no projeto Apps Script).
  function valuesFromExcel_(blob, name) {
    if (typeof Drive === 'undefined') {
      throw new Error('Serviço avançado "Drive API" não habilitado no Apps Script. Veja o README.');
    }
    const converted = Drive.Files.create(
      { name: 'tmp-importacao-' + name, mimeType: MimeType.GOOGLE_SHEETS },
      blob
    );
    try {
      return SpreadsheetApp.openById(converted.id).getSheets().map(sh => {
        const lastRow = sh.getLastRow();
        const lastCol = sh.getLastColumn();
        return lastRow && lastCol ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [];
      });
    } finally {
      // Move a cópia temporária para a lixeira (o arquivo original fica salvo na pasta do processo).
      try { DriveApp.getFileById(converted.id).setTrashed(true); } catch (e) { /* ignora */ }
    }
  }

  function extractSkus_(sheets) {
    for (let s = 0; s < sheets.length; s++) {
      const values = sheets[s];
      const limit = Math.min(values.length, HEADER_SEARCH_ROWS);
      for (let r = 0; r < limit; r++) {
        const normalized = values[r].map(normalizeHeader_);
        const skuIdx = normalized.indexOf(SKU_COLUMN);
        const descIdx = normalized.indexOf(DESCRIPTION_COLUMN);
        if (skuIdx < 0 || descIdx < 0) continue;

        const seen = {};
        const items = [];
        let ignored = 0;
        for (let i = r + 1; i < values.length; i++) {
          const sku = skuText_(values[i][skuIdx]);
          const descricao = text_(values[i][descIdx]);
          if (!sku && !descricao) continue;           // linha vazia
          if (!sku || !descricao || seen[sku]) { ignored++; continue; }
          seen[sku] = true;
          items.push({ sku, descricao });
        }
        return { items, ignored };
      }
    }
    throw new Error('Não encontrei as colunas "CÓD DE BARRAS" e "DESCRICAO ANVISA" nas primeiras linhas da planilha.');
  }

  function folder_() {
    const id = PropertiesService.getScriptProperties().getProperty('PROCESS_FOLDER_ID');
    if (!id) throw new Error('Propriedade de script não configurada: PROCESS_FOLDER_ID');
    return DriveApp.getFolderById(id);
  }

  // ---------- Upload ----------

  function upload(input) {
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    assertInternal_(perfil);

    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    ensureSheets_();
    const prior = Repository.find(PROC, 'REQUEST_ID', requestId);
    if (prior) return { ok: true, data: map_(prior.record), idempotent: true };

    const numero = text_(input.numeroProcesso);
    if (!numero) throw new Error('Informe o número do processo.');
    if (active_().some(x => upper_(x.record.NUMERO_PROCESSO) === upper_(numero))) {
      throw new Error('Já existe um processo ativo com o número ' + numero + '.');
    }

    const branch = ClientBranchService.assertAllowed(author, perfil, input.cnpjCliente);

    const fileName = text_(input.arquivoNome);
    const ext = extension_(fileName);
    if (['xlsx', 'xls', 'csv'].indexOf(ext) < 0) {
      throw new Error('Envie a planilha em Excel (.xlsx ou .xls) ou CSV.');
    }
    const content = text_(input.arquivoBase64);
    if (!content) throw new Error('Arquivo não recebido.');
    const bytes = Utilities.base64Decode(content);
    if (bytes.length > MAX_FILE_BYTES) throw new Error('Arquivo acima de 10 MB.');

    const mime = ext === 'csv' ? MimeType.CSV : ext === 'xls' ? XLS_MIME : XLSX_MIME;
    const safeName = (numero + ' - ' + fileName).replace(/[\\/:*?"<>|]/g, '-');
    const blob = Utilities.newBlob(bytes, mime, safeName);

    // Lê antes de salvar: planilha inválida não deixa arquivo órfão no Drive.
    const parsed = extractSkus_(ext === 'csv' ? valuesFromCsv_(blob) : valuesFromExcel_(blob, safeName));
    if (!parsed.items.length) throw new Error('Nenhum SKU com código de barras e descrição foi encontrado na planilha.');

    const file = folder_().createFile(blob);
    const now = new Date();
    const id = 'PC-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 6).toUpperCase();

    const record = {
      ID_PROCESSO: id,
      NUMERO_PROCESSO: numero,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      ARQUIVO_ID: file.getId(),
      ARQUIVO_NOME: fileName,
      ARQUIVO_URL: file.getUrl(),
      QTD_SKUS: parsed.items.length,
      QTD_IGNORADOS: parsed.ignored,
      MATRICULA_CRIACAO: author,
      CRIADO_EM: now,
      VERSAO: 1,
      ATIVO: 'SIM',
      REQUEST_ID: requestId
    };

    Repository.append(PROC, record, ['ID_PROCESSO', 'NUMERO_PROCESSO', 'CNPJ_CLIENTE', 'ARQUIVO_ID', 'MATRICULA_CRIACAO', 'REQUEST_ID']);
    Repository.appendMany(
      SKUS,
      parsed.items.map(item => ({ ID_PROCESSO: id, NUMERO_PROCESSO: numero, SKU: item.sku, DESCRICAO: item.descricao })),
      ['ID_PROCESSO', 'NUMERO_PROCESSO', 'SKU']
    );

    const mapped = map_(record);
    AuditService.log('PROCESSO', id, 'CRIAR', author, null, mapped, null, 1);
    return { ok: true, data: mapped };
  }

  return { list, get, skus, describe, upload };
})();
