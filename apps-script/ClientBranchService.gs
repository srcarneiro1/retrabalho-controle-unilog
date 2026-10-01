const ClientBranchService = (() => {
  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }
  function cnpj_(v) { return text_(v).replace(/\D/g, ''); }

  function mapBranch_(r) {
    return {
      cnpj: cnpj_(r.CNPJ),
      nomeCliente: text_(r.NOME_CLIENTE),
      filial: text_(r.FILIAL),
      ativo: upper_(r.ATIVO) || 'SIM'
    };
  }

  function all() {
    return Repository.list('CLIENTES_FILIAIS')
      .map(x => mapBranch_(x.record))
      .filter(x => x.cnpj && x.nomeCliente && x.filial)
      .sort((a,b) => (a.nomeCliente + ' ' + a.filial).localeCompare(b.nomeCliente + ' ' + b.filial));
  }

  function allActive() {
    return all().filter(x => x.ativo !== 'NAO');
  }

  function assignedCnpjs_(matricula) {
    const m = text_(matricula);
    return Repository.list('USUARIO_FILIAIS')
      .map(x => x.record)
      .filter(r => text_(r.MATRICULA) === m && upper_(r.ATIVO) !== 'NAO')
      .map(r => cnpj_(r.CNPJ))
      .filter(Boolean);
  }

  function branchesForScope(matricula, perfil) {
    const catalog = all();
    const assigned = assignedCnpjs_(matricula);

    if (upper_(perfil) === 'ADMIN' && assigned.length === 0) return catalog;

    const set = {};
    assigned.forEach(cnpj => { set[cnpj] = true; });
    return catalog.filter(branch => set[branch.cnpj]);
  }

  function availableForUser(matricula, perfil) {
    return branchesForScope(matricula, perfil).filter(branch => branch.ativo !== 'NAO');
  }

  function assertAllowed(matricula, perfil, cnpjValue) {
    const target = cnpj_(cnpjValue);
    const branch = availableForUser(matricula, perfil).find(x => x.cnpj === target);
    if (!branch) throw new Error('Você não possui acesso a esta filial ou ela está inativa.');
    return branch;
  }

  function validateAssignments(perfilValue, cnpjsValue) {
    const perfil = upper_(perfilValue);
    const requested = Array.isArray(cnpjsValue) ? cnpjsValue.map(cnpj_).filter(Boolean) : [];
    const unique = [...new Set(requested)];
    const valid = {};
    allActive().forEach(branch => { valid[branch.cnpj] = branch; });

    unique.forEach(cnpj => {
      if (!valid[cnpj]) throw new Error('Filial/CNPJ inválido ou inativo: ' + cnpj);
    });

    if (perfil !== 'ADMIN' && unique.length === 0) {
      throw new Error('Vincule pelo menos uma filial ao usuário.');
    }

    if (perfil === 'CLIENTE' && unique.length) {
      const clients = [...new Set(unique.map(cnpj => valid[cnpj].nomeCliente.toUpperCase()))];
      if (clients.length > 1) {
        throw new Error('Um usuário CLIENTE só pode ser vinculado a CNPJs do mesmo cliente.');
      }
    }

    return unique;
  }

  function setAssignments(input) {
    const matricula = text_(input.matricula);
    const perfil = upper_(input.perfil);
    const author = text_(input.matriculaAutor);
    const unique = validateAssignments(perfil, input.cnpjs);

    const currentRows = Repository.list('USUARIO_FILIAIS')
      .filter(x => text_(x.record.MATRICULA) === matricula);
    const currentMap = {};
    currentRows.forEach(x => { currentMap[cnpj_(x.record.CNPJ)] = x; });
    const now = new Date();

    currentRows.forEach(x => {
      const cnpj = cnpj_(x.record.CNPJ);
      const shouldBeActive = unique.indexOf(cnpj) >= 0;
      const isActive = upper_(x.record.ATIVO) !== 'NAO';
      if (shouldBeActive !== isActive) {
        const oldVersion = Number(x.record.VERSAO || 0);
        Repository.update('USUARIO_FILIAIS', x.rowNumber, {
          ATIVO: shouldBeActive ? 'SIM' : 'NAO',
          ATUALIZADO_EM: now,
          ATUALIZADO_POR: author,
          VERSAO: oldVersion + 1
        }, ['ATUALIZADO_POR']);
      }
    });

    unique.forEach(cnpj => {
      if (currentMap[cnpj]) return;
      Repository.append('USUARIO_FILIAIS', {
        MATRICULA: matricula,
        CNPJ: cnpj,
        ATIVO: 'SIM',
        CRIADO_EM: now,
        CRIADO_POR: author,
        ATUALIZADO_EM: now,
        ATUALIZADO_POR: author,
        VERSAO: 1
      }, ['MATRICULA','CNPJ','CRIADO_POR','ATUALIZADO_POR']);
    });

    return assignedCnpjs_(matricula);
  }

  function assignedCnpjs(matricula) {
    return assignedCnpjs_(matricula);
  }

  function scopeCnpjs(matricula, perfil) {
    return branchesForScope(matricula, perfil).map(x => x.cnpj);
  }

  return {
    all,
    allActive,
    availableForUser,
    assertAllowed,
    validateAssignments,
    setAssignments,
    assignedCnpjs,
    scopeCnpjs
  };
})();
