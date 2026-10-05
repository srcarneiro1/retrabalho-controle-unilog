const LaborService = (() => {
  const SHEET = 'MAO_DE_OBRA';
  const HEADERS = [
    'ID_MAO_OBRA',
    'DATA',
    'CNPJ_CLIENTE',
    'NOME_CLIENTE',
    'FILIAL',
    'QTD_CASA',
    'QTD_TERCEIROS',
    'QTD_TOTAL',
    'OBSERVACAO',
    'MATRICULA_CRIACAO',
    'CRIADO_EM',
    'MATRICULA_ATUALIZACAO',
    'ATUALIZADO_EM',
    'VERSAO',
    'ATIVO',
    'REQUEST_ID',
    'INATIVADO_EM',
    'INATIVADO_POR',
    'MOTIVO_INATIVACAO'
  ];

  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }

  function ensureSheet_() {
    Repository.ensure(SHEET, HEADERS);
  }

  function int_(v, label) {
    const raw = v == null || v === '' ? 0 : v;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(label + ' inválida.');
    }
    return n;
  }

  function parseDate_(v) {
    const s = text_(v);
    const p = s.split('-').map(Number);
    if (!s || p.length !== 3 || !p[0] || !p[1] || !p[2]) throw new Error('Data inválida.');
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

  function assertInternal_(perfil) {
    if (perfil === 'CLIENTE') throw new Error('O perfil CLIENTE não acessa o controle de mão de obra.');
  }

  function allowedSet_(matricula, perfil) {
    const set = {};
    ClientBranchService.scopeCnpjs(matricula, perfil).forEach(cnpj => { set[cnpj] = true; });
    return set;
  }

  function map_(r) {
    const casa = Number(r.QTD_CASA || 0);
    const terceiros = Number(r.QTD_TERCEIROS || 0);
    return {
      id: text_(r.ID_MAO_OBRA),
      requestId: text_(r.REQUEST_ID),
      data: iso_(r.DATA),
      cnpjCliente: text_(r.CNPJ_CLIENTE).replace(/\D/g, ''),
      nomeCliente: text_(r.NOME_CLIENTE),
      filial: text_(r.FILIAL),
      qtdCasa: casa,
      qtdTerceiros: terceiros,
      qtdTotal: Number(r.QTD_TOTAL || casa + terceiros),
      observacao: text_(r.OBSERVACAO),
      matriculaCriacao: text_(r.MATRICULA_CRIACAO),
      criadoEm: dt_(r.CRIADO_EM),
      matriculaAtualizacao: text_(r.MATRICULA_ATUALIZACAO),
      atualizadoEm: dt_(r.ATUALIZADO_EM),
      versao: Number(r.VERSAO || 0),
      ativo: text_(r.ATIVO) || 'SIM'
    };
  }

  function active_() {
    ensureSheet_();
    return Repository.list(SHEET).filter(x => upper_(x.record.ATIVO) !== 'NAO');
  }

  // IDs de todos os registros (ativos e inativos) no escopo do usuário — usado pela auditoria.
  function idsForScope(matricula, perfil) {
    const profile = upper_(perfil);
    assertInternal_(profile);
    ensureSheet_();
    const allowed = allowedSet_(text_(matricula), profile);
    return Repository.list(SHEET)
      .map(x => map_(x.record))
      .filter(r => Boolean(allowed[r.cnpjCliente]))
      .map(r => r.id);
  }

  function list(matricula, perfil) {
    const profile = upper_(perfil);
    assertInternal_(profile);
    const allowed = allowedSet_(text_(matricula), profile);
    return active_()
      .map(x => map_(x.record))
      .filter(r => Boolean(allowed[r.cnpjCliente]))
      .sort((a, b) => (b.data + b.criadoEm).localeCompare(a.data + a.criadoEm));
  }

  // Um único registro por dia e por filial.
  function duplicate_(dateIso, cnpj, ignoreId) {
    return active_().some(x => {
      const m = map_(x.record);
      return m.data === dateIso && m.cnpjCliente === cnpj && m.id !== ignoreId;
    });
  }

  function quantities_(input) {
    const qtdCasa = int_(input.qtdCasa, 'Quantidade de mão de obra da casa');
    const qtdTerceiros = int_(input.qtdTerceiros, 'Quantidade de terceiros');
    if (qtdCasa + qtdTerceiros <= 0) {
      throw new Error('Informe ao menos uma pessoa (casa ou terceiros).');
    }
    return { qtdCasa, qtdTerceiros };
  }

  function create(input) {
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    assertInternal_(perfil);

    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    ensureSheet_();
    const prior = Repository.find(SHEET, 'REQUEST_ID', requestId);
    if (prior) return { ok: true, data: map_(prior.record), idempotent: true };

    const branch = ClientBranchService.assertAllowed(author, perfil, input.cnpjCliente);
    const date = parseDate_(input.data);
    const q = quantities_(input);

    if (duplicate_(iso_(date), branch.cnpj, '')) {
      throw new Error('Já existe lançamento de mão de obra para esta filial nesta data. Edite o registro existente.');
    }

    const now = new Date();
    const id = 'MO-' + Utilities.formatDate(now, AppConfig.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    const record = {
      ID_MAO_OBRA: id,
      DATA: date,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      QTD_CASA: q.qtdCasa,
      QTD_TERCEIROS: q.qtdTerceiros,
      QTD_TOTAL: q.qtdCasa + q.qtdTerceiros,
      OBSERVACAO: text_(input.observacao),
      MATRICULA_CRIACAO: author,
      CRIADO_EM: now,
      MATRICULA_ATUALIZACAO: '',
      ATUALIZADO_EM: '',
      VERSAO: 1,
      ATIVO: 'SIM',
      REQUEST_ID: requestId
    };

    Repository.append(SHEET, record, ['ID_MAO_OBRA', 'CNPJ_CLIENTE', 'MATRICULA_CRIACAO', 'REQUEST_ID']);
    AuditService.log('MAO_DE_OBRA', id, 'CRIAR', author, null, map_(record), null, 1);
    return { ok: true, data: map_(record) };
  }

  function edit(input) {
    const id = text_(input.id);
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    if (perfil !== 'SUPERVISOR' && perfil !== 'ADMIN') {
      throw new Error('Somente SUPERVISOR e ADMIN podem editar a mão de obra.');
    }

    ensureSheet_();
    const hit = Repository.find(SHEET, 'ID_MAO_OBRA', id);
    if (!hit) throw new Error('Registro não encontrado.');

    const before = map_(hit.record);
    const scope = allowedSet_(author, perfil);
    if (!scope[before.cnpjCliente]) throw new Error('Você não possui acesso a este registro.');

    const currentVersion = Number(hit.record.VERSAO || 0);
    if (Number(input.versao || 0) !== currentVersion) {
      throw new Error('O registro foi alterado por outro usuário. Atualize a lista antes de editar.');
    }

    const branch = ClientBranchService.assertAllowed(author, perfil, input.cnpjCliente);
    const date = parseDate_(input.data);
    const q = quantities_(input);

    if (duplicate_(iso_(date), branch.cnpj, id)) {
      throw new Error('Já existe lançamento de mão de obra para esta filial nesta data.');
    }

    const nextVersion = currentVersion + 1;
    Repository.update(SHEET, hit.rowNumber, {
      DATA: date,
      CNPJ_CLIENTE: branch.cnpj,
      NOME_CLIENTE: branch.nomeCliente,
      FILIAL: branch.filial,
      QTD_CASA: q.qtdCasa,
      QTD_TERCEIROS: q.qtdTerceiros,
      QTD_TOTAL: q.qtdCasa + q.qtdTerceiros,
      OBSERVACAO: text_(input.observacao),
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    }, ['CNPJ_CLIENTE', 'MATRICULA_ATUALIZACAO']);

    const after = map_(Repository.rowObject(SHEET, hit.rowNumber));
    AuditService.log('MAO_DE_OBRA', id, 'EDITAR', author, before, after, currentVersion, nextVersion);
    return { ok: true, data: after };
  }

  // Inativação lógica: o registro sai da lista e libera a data/filial para novo lançamento,
  // mas permanece na planilha com autor, data e motivo (rastreável na auditoria).
  function deactivate(input) {
    const id = text_(input.id);
    const author = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    const reason = text_(input.motivo);
    if (perfil !== 'SUPERVISOR' && perfil !== 'ADMIN') {
      throw new Error('Somente SUPERVISOR e ADMIN podem inativar lançamentos de mão de obra.');
    }
    if (!reason) throw new Error('Informe o motivo da inativação.');

    ensureSheet_();
    const hit = Repository.find(SHEET, 'ID_MAO_OBRA', id);
    if (!hit) throw new Error('Registro não encontrado.');

    const before = map_(hit.record);
    const scope = allowedSet_(author, perfil);
    if (!scope[before.cnpjCliente]) throw new Error('Você não possui acesso a este registro.');
    if (upper_(hit.record.ATIVO) === 'NAO') return { ok: true, data: before, idempotent: true };

    const currentVersion = Number(hit.record.VERSAO || 0);
    if (Number(input.versao || 0) !== currentVersion) {
      throw new Error('O registro foi alterado por outro usuário. Atualize a lista antes de inativar.');
    }

    const nextVersion = currentVersion + 1;
    Repository.update(SHEET, hit.rowNumber, {
      ATIVO: 'NAO',
      INATIVADO_EM: new Date(),
      INATIVADO_POR: author,
      MOTIVO_INATIVACAO: reason,
      MATRICULA_ATUALIZACAO: author,
      ATUALIZADO_EM: new Date(),
      VERSAO: nextVersion
    }, ['INATIVADO_POR', 'MATRICULA_ATUALIZACAO']);

    const after = map_(Repository.rowObject(SHEET, hit.rowNumber));
    after.ativo = 'NAO';
    after.motivoInativacao = reason;
    AuditService.log('MAO_DE_OBRA', id, 'INATIVAR', author, before, after, currentVersion, nextVersion);
    return { ok: true, data: after };
  }

  return { list, idsForScope, create, edit, deactivate, ensureSheet: ensureSheet_ };
})();
