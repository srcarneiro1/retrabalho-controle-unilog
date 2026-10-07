const ReworkService = (() => {
  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }

  function int_(v, label, allowZero) {
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < (allowZero ? 0 : 1)) {
      throw new Error(label + ' inválida.');
    }
    return n;
  }

  function parseDate_(v, label, required) {
    const s = text_(v);
    if (!s) {
      if (required) throw new Error(label + ' obrigatória.');
      return '';
    }
    const p = s.split('-').map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) throw new Error(label + ' inválida.');
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function iso_(v) {
    if (!v) return '';
    const d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(v);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'yyyy-MM-dd');
  }

  function dt_(v) {
    if (!v) return '';
    const d = Object.prototype.toString.call(v) === '[object Date]' ? v : new Date(v);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  }

  function validMonth_(month) {
    const value = text_(month);
    return /^\d{4}-\d{2}$/.test(value) ? value : '';
  }

  const EXTRA_HEADERS = [
    'NUMERO_PROCESSO',
    'ID_PROCESSO',
    'ID_LOTE',
    'QTD_TESTER',
    'ETIQUETAS_CONFECCIONADAS',
    'PRECO_TESTER_UNIT',
    'PRECO_CONFECCAO_UNIT',
    'VALOR_TESTER',
    'VALOR_CONFECCAO',
    'QTD_COMBO',
    'PRECO_COMBO_UNIT',
    'VALOR_COMBO'
  ];
  const TEXT_FIELDS = ['ID_RETRABALHO','SKU','MATRICULA_CRIACAO','REQUEST_ID','ID_PRECO','CNPJ_CLIENTE','CANCELADO_POR','ID_PROCESSO','NUMERO_PROCESSO','ID_LOTE'];
  const MAX_BATCH = 100;

  function ensureColumns_() {
    Repository.ensure('RETRABALHOS', EXTRA_HEADERS);
  }

  function optionalInt_(v, label) {
    return int_(v == null || v === '' ? 0 : v, label, true);
  }

  // Serviços por SKU (modelo de 07/10/2026 — cada unidade recebe UM tipo de etiquetagem):
  // - Combo: nacionalização + RFID ou ADIPAC, cobrado como um serviço único;
  // - Nacionalização: só a etiqueta de nacionalização;
  // - Tester: transformação em tester;
  // - Confeccionadas: confecção/impressão de etiqueta de nacionalização.
  // Regras:
  // - quantidade retrabalhada é obrigatória (>= 1);
  // - combo + nacionalização não pode passar da quantidade (a unidade recebe um ou outro);
  // - tester não pode passar da quantidade; confeccionadas são livres;
  // - ao menos um serviço. RFID/ADIPAC avulso não existe mais (sempre 0 em gravações novas).
  function services_(input, prefix) {
    const p = prefix || '';
    const quantidade = int_(input.quantidade, p + 'Quantidade retrabalhada', false);
    const combo = optionalInt_(input.combo, p + 'Quantidade de combo (nacionalização + RFID/ADIPAC)');
    const nacionalizacao = optionalInt_(input.nacionalizacao, p + 'Quantidade de nacionalização');
    const tester = optionalInt_(input.tester, p + 'Quantidade de transformação em tester');
    const confeccao = optionalInt_(input.confeccao, p + 'Quantidade de etiquetas confeccionadas');
    if (combo + nacionalizacao > quantidade) {
      throw new Error(p + 'Combo + nacionalização não pode ser maior que a quantidade retrabalhada (cada unidade recebe um ou outro).');
    }
    if (tester > quantidade) throw new Error(p + 'Transformação em tester não pode ser maior que a quantidade retrabalhada.');
    if (combo + nacionalizacao + tester + confeccao <= 0) {
      throw new Error(p + 'Informe ao menos um serviço: combo, nacionalização, tester ou etiquetas confeccionadas.');
    }
    return { quantidade, combo, nacionalizacao, rfid: 0, tester, confeccao };
  }

  function newId_(now) {
    return 'RT-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,8).toUpperCase();
  }

  // Campos financeiros e de serviço calculados a partir do preço vigente.
  function chargeFields_(services, validade, price) {
    return {
      QTD_RETRABALHADA: services.quantidade,
      ETIQUETAS_NACIONALIZACAO: services.nacionalizacao,
      ETIQUETAS_RFID: services.rfid,
      QTD_COMBO: services.combo,
      ETIQUETAS_VALIDADE: validade,
      QTD_TESTER: services.tester,
      ETIQUETAS_CONFECCIONADAS: services.confeccao,
      // Cada combo aplica 2 etiquetas (nacionalização + RFID/ADIPAC).
      TOTAL_ETIQUETAS: services.nacionalizacao + 2 * services.combo + services.rfid + services.confeccao + validade,
      ID_PRECO: price.idPreco,
      PRECO_NACIONALIZACAO_UNIT: price.precoNacionalizacaoUnit,
      PRECO_RFID_ADICIONAL_UNIT: price.precoRfidAdicionalUnit,
      PRECO_COMBO_UNIT: price.precoComboUnit,
      PRECO_VALIDADE_UNIT: price.precoValidadeUnit,
      PRECO_TESTER_UNIT: price.precoTesterUnit,
      PRECO_CONFECCAO_UNIT: price.precoConfeccaoUnit,
      VALOR_NACIONALIZACAO: price.valorNacionalizacao,
      VALOR_RFID_ADICIONAL: price.valorRfidAdicional,
      VALOR_COMBO: price.valorCombo,
      VALOR_VALIDADE: price.valorValidade,
      VALOR_TESTER: price.valorTester,
      VALOR_CONFECCAO: price.valorConfeccao,
      VALOR_TOTAL_COBRANCA: price.valorTotalCobranca
    };
  }

  function allowedSet_(matricula, perfil) {
    const set = {};
    ClientBranchService.scopeCnpjs(matricula, perfil).forEach(cnpj => { set[cnpj] = true; });
    return set;
  }

  function map_(r) {
    const cancelada = upper_(r.COBRANCA_CANCELADA) === 'SIM';
    const valorOriginal = Number(r.VALOR_TOTAL_COBRANCA || 0);
    return {
      id: text_(r.ID_RETRABALHO),
      requestId: text_(r.REQUEST_ID),
      dataEfetivacao: iso_(r.DATA_EFETIVACAO),
      sku: text_(r.SKU),
      descricao: text_(r.DESCRICAO),
      quantidade: Number(r.QTD_RETRABALHADA || 0),
      dataValidade: iso_(r.DATA_VALIDADE_INSERIDA),
      nacionalizacao: Number(r.ETIQUETAS_NACIONALIZACAO || 0),
      rfid: Number(r.ETIQUETAS_RFID || 0),
      combo: Number(r.QTD_COMBO || 0),
      precoComboUnit: Number(r.PRECO_COMBO_UNIT || 0),
      valorCombo: Number(r.VALOR_COMBO || 0),
      validade: Number(r.ETIQUETAS_VALIDADE || 0),
      tester: Number(r.QTD_TESTER || 0),
      confeccao: Number(r.ETIQUETAS_CONFECCIONADAS || 0),
      numeroProcesso: text_(r.NUMERO_PROCESSO),
      idProcesso: text_(r.ID_PROCESSO),
      idLote: text_(r.ID_LOTE),
      precoTesterUnit: Number(r.PRECO_TESTER_UNIT || 0),
      precoConfeccaoUnit: Number(r.PRECO_CONFECCAO_UNIT || 0),
      valorTester: Number(r.VALOR_TESTER || 0),
      valorConfeccao: Number(r.VALOR_CONFECCAO || 0),
      totalEtiquetas: Number(r.TOTAL_ETIQUETAS || 0),
      idPreco: text_(r.ID_PRECO),
      precoNacionalizacaoUnit: Number(r.PRECO_NACIONALIZACAO_UNIT || 0),
      precoRfidAdicionalUnit: Number(r.PRECO_RFID_ADICIONAL_UNIT || 0),
      precoValidadeUnit: Number(r.PRECO_VALIDADE_UNIT || 0),
      valorNacionalizacao: Number(r.VALOR_NACIONALIZACAO || 0),
      valorRfidAdicional: Number(r.VALOR_RFID_ADICIONAL || 0),
      valorValidade: Number(r.VALOR_VALIDADE || 0),
      valorTotalCobranca: valorOriginal,
      valorCobrancaEfetiva: cancelada ? 0 : valorOriginal,
      cobrancaCancelada: cancelada,
      canceladoEm: dt_(r.CANCELADO_EM),
      canceladoPor: text_(r.CANCELADO_POR),
      motivoCancelamento: text_(r.MOTIVO_CANCELAMENTO),
      cnpjCliente: text_(r.CNPJ_CLIENTE).replace(/\D/g,''),
      nomeCliente: text_(r.NOME_CLIENTE),
      filial: text_(r.FILIAL),
      matriculaCriacao: text_(r.MATRICULA_CRIACAO),
      criadoEm: dt_(r.CRIADO_EM),
      matriculaAtualizacao: text_(r.MATRICULA_ATUALIZACAO),
      atualizadoEm: dt_(r.ATUALIZADO_EM),
      versao: Number(r.VERSAO || 0),
      ativo: text_(r.ATIVO) || 'SIM'
    };
  }

  function list(month, matricula, perfil) {
    const filterMonth = validMonth_(month);
    const allowed = allowedSet_(matricula, perfil);
    return Repository.list('RETRABALHOS')
      .map(x => x.record)
      .filter(r => upper_(r.ATIVO) !== 'NAO')
      .map(map_)
      .filter(r => Boolean(allowed[r.cnpjCliente]))
      .filter(r => !filterMonth || r.dataEfetivacao.slice(0, 7) === filterMonth)
      .sort((a,b) => (b.dataEfetivacao + b.criadoEm).localeCompare(a.dataEfetivacao + a.criadoEm));
  }

  function months(matricula, perfil) {
    const unique = {};
    list('', matricula, perfil).forEach(item => {
      const month = item.dataEfetivacao.slice(0, 7);
      if (month) unique[month] = true;
    });
    return Object.keys(unique).sort().reverse();
  }

  function idsForScope(month, matricula, perfil) {
    return list(month, matricula, perfil).map(item => item.id);
  }

  // Lançamento individual (compatibilidade). A interface usa createBatch.
  function create(input) {
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    if (perfil === 'CLIENTE') throw new Error('Perfil CLIENTE é somente leitura.');

    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    const prior = Repository.find('RETRABALHOS','REQUEST_ID',requestId);
    if (prior) return { ok: true, data: map_(prior.record), idempotent: true };

    const branch = ClientBranchService.assertAllowed(author, perfil, input.cnpjCliente);
    const sku = text_(input.sku);
    const descricao = text_(input.descricao);
    if (!sku) throw new Error('Informe o SKU.');
    if (!descricao) throw new Error('Informe a descrição.');

    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);
    const services = services_(input);
    const price = PriceService.calculate(date, services);

    ensureColumns_();
    const now = new Date();
    const id = newId_(now);
    const record = Object.assign({
      ID_RETRABALHO: id,
      DATA_EFETIVACAO: date,
      SKU: sku,
      DESCRICAO: descricao,
      DATA_VALIDADE_INSERIDA: '',
      MATRICULA_CRIACAO: author,
      CRIADO_EM: now,
      MATRICULA_ATUALIZACAO: '',
      ATUALIZADO_EM: '',
      VERSAO: 1,
      ATIVO: 'SIM',
      REQUEST_ID: requestId,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      COBRANCA_CANCELADA: 'NAO',
      CANCELADO_EM: '',
      CANCELADO_POR: '',
      MOTIVO_CANCELAMENTO: ''
    }, chargeFields_(services, 0, price));

    Repository.append('RETRABALHOS', record, TEXT_FIELDS);
    AuditService.log('RETRABALHO', id, 'CRIAR', author, null, map_(record), null, 1);
    return { ok: true, data: map_(record) };
  }

  // Lançamento em lote: até 100 SKUs de um processo, com mesma data e filial do processo.
  // Cada SKU vira um registro próprio (auditoria, edição e cancelamento continuam por registro).
  function createBatch(input) {
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    if (perfil === 'CLIENTE') throw new Error('Perfil CLIENTE é somente leitura.');

    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    // Idempotência: as linhas do lote usam REQUEST_ID "<lote>:<n>".
    const prefix = requestId + ':';
    const prior = Repository.list('RETRABALHOS')
      .filter(x => text_(x.record.REQUEST_ID).indexOf(prefix) === 0)
      .map(x => map_(x.record));
    if (prior.length) return { ok: true, data: prior, idempotent: true };

    const process = ProcessService.get(input.idProcesso, author, perfil);
    const branch = ClientBranchService.assertAllowed(author, perfil, process.cnpjCliente);
    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);

    const lines = Array.isArray(input.linhas) ? input.linhas : [];
    if (!lines.length) throw new Error('Selecione ao menos um SKU.');
    if (lines.length > MAX_BATCH) throw new Error('Selecione no máximo ' + MAX_BATCH + ' SKUs por lançamento.');

    const price = PriceService.findByDate(date);
    const seen = {};
    const now = new Date();
    const idLote = 'LT-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,6).toUpperCase();

    const records = lines.map((line, index) => {
      const label = 'Linha ' + (index + 1) + ': ';
      const sku = text_(line && line.sku);
      if (!sku) throw new Error(label + 'SKU não informado.');
      if (seen[sku]) throw new Error(label + 'o SKU ' + sku + ' está repetido no lançamento.');
      seen[sku] = true;

      // A descrição vem sempre do processo (fonte oficial), nunca do navegador.
      const descricao = ProcessService.describe(process.id, sku);
      if (descricao == null) throw new Error(label + 'o SKU ' + sku + ' não pertence ao processo ' + process.numero + '.');
      if (!descricao) throw new Error(label + 'o SKU ' + sku + ' está sem descrição no processo.');

      const services = services_(line || {}, label);
      const charge = PriceService.calculate(date, services, price);

      return Object.assign({
        ID_RETRABALHO: newId_(now),
        DATA_EFETIVACAO: date,
        SKU: sku,
        DESCRICAO: descricao,
        DATA_VALIDADE_INSERIDA: '',
        MATRICULA_CRIACAO: author,
        CRIADO_EM: now,
        MATRICULA_ATUALIZACAO: '',
        ATUALIZADO_EM: '',
        VERSAO: 1,
        ATIVO: 'SIM',
        REQUEST_ID: prefix + (index + 1),
        CNPJ_CLIENTE: branch.cnpj,
        NOME_CLIENTE: branch.nomeCliente,
        FILIAL: branch.filial,
        NUMERO_PROCESSO: process.numero,
        ID_PROCESSO: process.id,
        ID_LOTE: idLote,
        COBRANCA_CANCELADA: 'NAO',
        CANCELADO_EM: '',
        CANCELADO_POR: '',
        MOTIVO_CANCELAMENTO: ''
      }, chargeFields_(services, 0, charge));
    });

    ensureColumns_();
    Repository.appendMany('RETRABALHOS', records, TEXT_FIELDS);
    const mapped = records.map(map_);
    AuditService.logMany(mapped.map(item => ({
      entity: 'RETRABALHO', id: item.id, action: 'CRIAR', author,
      before: null, after: item, oldVersion: null, newVersion: 1
    })));
    return { ok: true, data: mapped, idLote };
  }

  function edit(input) {
    const id = text_(input.id);
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    if (perfil === 'OPERACIONAL' || perfil === 'CLIENTE') {
      throw new Error('Seu perfil não pode editar registros.');
    }

    const hit = Repository.find('RETRABALHOS','ID_RETRABALHO',id);
    if (!hit) throw new Error('Registro não encontrado.');

    const current = map_(hit.record);
    if (current.cobrancaCancelada) {
      throw new Error('A cobrança deste registro já foi cancelada e o histórico não pode ser editado.');
    }

    const scope = allowedSet_(author, perfil);
    if (!scope[current.cnpjCliente]) throw new Error('Você não possui acesso a este registro.');

    const currentVersion = Number(hit.record.VERSAO || 0);
    const informedVersion = Number(input.versao || 0);
    if (informedVersion !== currentVersion) {
      throw new Error('O registro foi alterado por outro usuário. Atualize a lista antes de editar.');
    }

    const before = current;
    // Registro de processo mantém a filial do processo.
    const branch = ClientBranchService.assertAllowed(
      author, perfil, current.idProcesso ? current.cnpjCliente : input.cnpjCliente
    );
    // SKU e descrição são obrigatórios também na edição (antes só na criação).
    const sku = text_(input.sku);
    const descricao = text_(input.descricao);
    if (!sku) throw new Error('Informe o SKU.');
    if (!descricao) throw new Error('Informe a descrição.');
    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);
    const services = services_(input);
    // Registro vinculado a processo: o SKU precisa existir no processo e a descrição vem dele.
    let finalDescricao = descricao;
    if (current.idProcesso) {
      const fromProcess = ProcessService.describe(current.idProcesso, sku);
      if (fromProcess == null) throw new Error('O SKU ' + sku + ' não pertence ao processo ' + current.numeroProcesso + '.');
      finalDescricao = fromProcess || descricao;
    }
    // Registros históricos preservam a quantidade de Etiqueta de Validade já gravada,
    // para que a edição não altere silenciosamente uma cobrança antiga.
    const validade = Number(hit.record.ETIQUETAS_VALIDADE || 0);
    const price = PriceService.calculate(date, Object.assign({}, services, { validade: validade }));
    const nextVersion = currentVersion + 1;
    ensureColumns_();

    const updates = Object.assign({
      DATA_EFETIVACAO: date,
      SKU: sku,
      DESCRICAO: finalDescricao,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    }, chargeFields_(services, validade, price));

    Repository.update(
      'RETRABALHOS',
      hit.rowNumber,
      updates,
      ['SKU','ID_PRECO','CNPJ_CLIENTE','MATRICULA_ATUALIZACAO']
    );

    const after = map_(Repository.rowObject('RETRABALHOS', hit.rowNumber));
    AuditService.log('RETRABALHO', id, 'EDITAR', author, before, after, currentVersion, nextVersion);
    return { ok: true, data: after };
  }

  function cancelCharge(input) {
    const id = text_(input.id);
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    const reason = text_(input.motivo);

    if (perfil !== 'SUPERVISOR' && perfil !== 'ADMIN') {
      throw new Error('Somente SUPERVISOR e ADMIN podem cancelar uma cobrança.');
    }
    if (!reason) throw new Error('Informe o motivo do cancelamento da cobrança.');

    const hit = Repository.find('RETRABALHOS','ID_RETRABALHO',id);
    if (!hit) throw new Error('Registro não encontrado.');

    const before = map_(hit.record);
    const scope = allowedSet_(author, perfil);
    if (!scope[before.cnpjCliente]) throw new Error('Você não possui acesso a este registro.');
    if (before.cobrancaCancelada) return { ok:true, data:before, idempotent:true };

    const currentVersion = Number(hit.record.VERSAO || 0);
    const informedVersion = Number(input.versao || 0);
    if (informedVersion !== currentVersion) {
      throw new Error('O registro foi alterado por outro usuário. Atualize a lista antes de cancelar.');
    }

    const nextVersion = currentVersion + 1;
    Repository.update('RETRABALHOS', hit.rowNumber, {
      COBRANCA_CANCELADA: 'SIM',
      CANCELADO_EM: new Date(),
      CANCELADO_POR: author,
      MOTIVO_CANCELAMENTO: reason,
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    }, ['CANCELADO_POR','MATRICULA_ATUALIZACAO']);

    const after = map_(Repository.rowObject('RETRABALHOS', hit.rowNumber));
    AuditService.log('RETRABALHO', id, 'CANCELAR_COBRANCA', author, before, after, currentVersion, nextVersion);
    return { ok:true, data:after };
  }

  return { list, months, idsForScope, create, createBatch, edit, cancelCharge };
})();
