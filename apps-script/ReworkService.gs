const ReworkService = (() => {
  function text_(v) { return String(v == null ? '' : v).trim(); }

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

  function map_(r) {
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
      totalEtiquetas: Number(r.TOTAL_ETIQUETAS || 0),
      idPreco: text_(r.ID_PRECO),
      precoNacionalizacaoUnit: Number(r.PRECO_NACIONALIZACAO_UNIT || 0),
      precoRfidAdicionalUnit: Number(r.PRECO_RFID_ADICIONAL_UNIT || 0),
      valorNacionalizacao: Number(r.VALOR_NACIONALIZACAO || 0),
      valorRfidAdicional: Number(r.VALOR_RFID_ADICIONAL || 0),
      valorTotalCobranca: Number(r.VALOR_TOTAL_COBRANCA || 0),
      matriculaCriacao: text_(r.MATRICULA_CRIACAO),
      criadoEm: dt_(r.CRIADO_EM),
      matriculaAtualizacao: text_(r.MATRICULA_ATUALIZACAO),
      atualizadoEm: dt_(r.ATUALIZADO_EM),
      versao: Number(r.VERSAO || 0),
      ativo: text_(r.ATIVO) || 'SIM'
    };
  }

  function list(month) {
    const filterMonth = validMonth_(month);
    return Repository.list('RETRABALHOS')
      .map(x => x.record)
      .filter(r => text_(r.ATIVO).toUpperCase() !== 'NAO')
      .map(map_)
      .filter(r => !filterMonth || r.dataEfetivacao.slice(0, 7) === filterMonth)
      .sort((a,b) => (b.dataEfetivacao + b.criadoEm).localeCompare(a.dataEfetivacao + a.criadoEm));
  }

  function months() {
    const unique = {};
    list().forEach(item => {
      const month = item.dataEfetivacao.slice(0, 7);
      if (month) unique[month] = true;
    });
    return Object.keys(unique).sort().reverse();
  }

  function idsForMonth(month) {
    return list(month).map(item => item.id);
  }

  function create(input) {
    const author = text_(input.matriculaAutor);
    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    const prior = Repository.find('RETRABALHOS','REQUEST_ID',requestId);
    if (prior) return { ok: true, data: map_(prior.record), idempotent: true };

    const sku = text_(input.sku);
    const descricao = text_(input.descricao);
    if (!sku) throw new Error('Informe o SKU.');
    if (!descricao) throw new Error('Informe a descrição.');

    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);
    const nacionalizacao = int_(input.nacionalizacao, 'Quantidade de etiquetas de nacionalização', true);
    const rfid = int_(input.rfid, 'Quantidade de etiquetas RFID', true);
    if (rfid > nacionalizacao) {
      throw new Error('A quantidade de etiquetas RFID não pode ser maior que a quantidade de nacionalização.');
    }
    const price = PriceService.calculate(date, nacionalizacao, rfid);

    const now = new Date();
    const id = 'RT-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,8).toUpperCase();
    const record = {
      ID_RETRABALHO: id,
      DATA_EFETIVACAO: date,
      SKU: sku,
      DESCRICAO: descricao,
      QTD_RETRABALHADA: int_(input.quantidade,'Quantidade retrabalhada',false),
      DATA_VALIDADE_INSERIDA: parseDate_(input.dataValidade,'Data de validade',false),
      ETIQUETAS_NACIONALIZACAO: nacionalizacao,
      ETIQUETAS_RFID: rfid,
      TOTAL_ETIQUETAS: nacionalizacao + rfid,
      MATRICULA_CRIACAO: author,
      CRIADO_EM: now,
      MATRICULA_ATUALIZACAO: '',
      ATUALIZADO_EM: '',
      VERSAO: 1,
      ATIVO: 'SIM',
      REQUEST_ID: requestId,
      ID_PRECO: price.idPreco,
      PRECO_NACIONALIZACAO_UNIT: price.precoNacionalizacaoUnit,
      PRECO_RFID_ADICIONAL_UNIT: price.precoRfidAdicionalUnit,
      VALOR_NACIONALIZACAO: price.valorNacionalizacao,
      VALOR_RFID_ADICIONAL: price.valorRfidAdicional,
      VALOR_TOTAL_COBRANCA: price.valorTotalCobranca
    };

    Repository.append(
      'RETRABALHOS',
      record,
      ['ID_RETRABALHO','SKU','MATRICULA_CRIACAO','REQUEST_ID','ID_PRECO']
    );
    AuditService.log('RETRABALHO', id, 'CRIAR', author, null, map_(record), null, 1);
    return { ok: true, data: map_(record) };
  }

  function edit(input) {
    const id = text_(input.id);
    const author = text_(input.matriculaAutor);
    const hit = Repository.find('RETRABALHOS','ID_RETRABALHO',id);
    if (!hit) throw new Error('Registro não encontrado.');

    const currentVersion = Number(hit.record.VERSAO || 0);
    const informedVersion = Number(input.versao || 0);
    if (informedVersion !== currentVersion) {
      throw new Error('O registro foi alterado por outro usuário. Atualize a lista antes de editar.');
    }

    const before = map_(hit.record);
    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);
    const nacionalizacao = int_(input.nacionalizacao, 'Quantidade de etiquetas de nacionalização', true);
    const rfid = int_(input.rfid, 'Quantidade de etiquetas RFID', true);
    if (rfid > nacionalizacao) {
      throw new Error('A quantidade de etiquetas RFID não pode ser maior que a quantidade de nacionalização.');
    }
    const price = PriceService.calculate(date, nacionalizacao, rfid);
    const nextVersion = currentVersion + 1;

    const updates = {
      DATA_EFETIVACAO: date,
      SKU: text_(input.sku),
      DESCRICAO: text_(input.descricao),
      QTD_RETRABALHADA: int_(input.quantidade,'Quantidade retrabalhada',false),
      DATA_VALIDADE_INSERIDA: parseDate_(input.dataValidade,'Data de validade',false),
      ETIQUETAS_NACIONALIZACAO: nacionalizacao,
      ETIQUETAS_RFID: rfid,
      TOTAL_ETIQUETAS: nacionalizacao + rfid,
      ID_PRECO: price.idPreco,
      PRECO_NACIONALIZACAO_UNIT: price.precoNacionalizacaoUnit,
      PRECO_RFID_ADICIONAL_UNIT: price.precoRfidAdicionalUnit,
      VALOR_NACIONALIZACAO: price.valorNacionalizacao,
      VALOR_RFID_ADICIONAL: price.valorRfidAdicional,
      VALOR_TOTAL_COBRANCA: price.valorTotalCobranca,
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    };

    Repository.update(
      'RETRABALHOS',
      hit.rowNumber,
      updates,
      ['SKU','ID_PRECO','MATRICULA_ATUALIZACAO']
    );

    const after = map_(Repository.rowObject('RETRABALHOS', hit.rowNumber));
    AuditService.log('RETRABALHO', id, 'EDITAR', author, before, after, currentVersion, nextVersion);
    return { ok: true, data: after };
  }

  return { list, months, idsForMonth, create, edit };
})();