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

  // Nacionalização e RFID/ADIPAC são independentes e opcionais:
  // o lançamento pode conter um, outro ou ambos, mas precisa de ao menos uma etiqueta.
  // RFID/ADIPAC é uma única cobrança por unidade (RFID, ADIPAC ou os dois = mesma tarifa).
  function labels_(input) {
    const nacionalizacao = int_(
      input.nacionalizacao == null || input.nacionalizacao === '' ? 0 : input.nacionalizacao,
      'Quantidade de etiquetas de nacionalização',
      true
    );
    const rfid = int_(
      input.rfid == null || input.rfid === '' ? 0 : input.rfid,
      'Quantidade de etiquetas RFID/ADIPAC',
      true
    );
    if (nacionalizacao + rfid <= 0) {
      throw new Error('Informe ao menos uma etiqueta: Nacionalização e/ou RFID/ADIPAC.');
    }
    return { nacionalizacao, rfid };
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
      validade: Number(r.ETIQUETAS_VALIDADE || 0),
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
    const labels = labels_(input);
    const nacionalizacao = labels.nacionalizacao;
    const rfid = labels.rfid;
    // Etiqueta de Validade foi descontinuada: novos lançamentos gravam 0.
    const validade = 0;
    const price = PriceService.calculate(date, nacionalizacao, rfid, validade);

    const now = new Date();
    const id = 'RT-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0,8).toUpperCase();
    const record = {
      ID_RETRABALHO: id,
      DATA_EFETIVACAO: date,
      SKU: sku,
      DESCRICAO: descricao,
      QTD_RETRABALHADA: int_(input.quantidade,'Quantidade retrabalhada',false),
      // Validade inserida foi descontinuada: novos lançamentos não gravam data.
      DATA_VALIDADE_INSERIDA: '',
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
      VALOR_TOTAL_COBRANCA: price.valorTotalCobranca,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      ETIQUETAS_VALIDADE: validade,
      PRECO_VALIDADE_UNIT: price.precoValidadeUnit,
      VALOR_VALIDADE: price.valorValidade,
      COBRANCA_CANCELADA: 'NAO',
      CANCELADO_EM: '',
      CANCELADO_POR: '',
      MOTIVO_CANCELAMENTO: ''
    };

    Repository.append(
      'RETRABALHOS',
      record,
      ['ID_RETRABALHO','SKU','MATRICULA_CRIACAO','REQUEST_ID','ID_PRECO','CNPJ_CLIENTE','CANCELADO_POR']
    );
    AuditService.log('RETRABALHO', id, 'CRIAR', author, null, map_(record), null, 1);
    return { ok: true, data: map_(record) };
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
    const branch = ClientBranchService.assertAllowed(author, perfil, input.cnpjCliente);
    // SKU e descrição são obrigatórios também na edição (antes só na criação).
    const sku = text_(input.sku);
    const descricao = text_(input.descricao);
    if (!sku) throw new Error('Informe o SKU.');
    if (!descricao) throw new Error('Informe a descrição.');
    const date = parseDate_(input.dataEfetivacao,'Data de efetivação',true);
    const labels = labels_(input);
    const nacionalizacao = labels.nacionalizacao;
    const rfid = labels.rfid;
    // Registros históricos preservam a quantidade de Etiqueta de Validade já gravada,
    // para que a edição não altere silenciosamente uma cobrança antiga.
    const validade = Number(hit.record.ETIQUETAS_VALIDADE || 0);
    const price = PriceService.calculate(date, nacionalizacao, rfid, validade);
    const nextVersion = currentVersion + 1;

    const updates = {
      DATA_EFETIVACAO: date,
      SKU: sku,
      DESCRICAO: descricao,
      QTD_RETRABALHADA: int_(input.quantidade,'Quantidade retrabalhada',false),
      ETIQUETAS_NACIONALIZACAO: nacionalizacao,
      ETIQUETAS_RFID: rfid,
      ETIQUETAS_VALIDADE: validade,
      TOTAL_ETIQUETAS: nacionalizacao + rfid + validade,
      ID_PRECO: price.idPreco,
      PRECO_NACIONALIZACAO_UNIT: price.precoNacionalizacaoUnit,
      PRECO_RFID_ADICIONAL_UNIT: price.precoRfidAdicionalUnit,
      PRECO_VALIDADE_UNIT: price.precoValidadeUnit,
      VALOR_NACIONALIZACAO: price.valorNacionalizacao,
      VALOR_RFID_ADICIONAL: price.valorRfidAdicional,
      VALOR_VALIDADE: price.valorValidade,
      VALOR_TOTAL_COBRANCA: price.valorTotalCobranca,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    };

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

  return { list, months, idsForScope, create, edit, cancelCharge };
})();
