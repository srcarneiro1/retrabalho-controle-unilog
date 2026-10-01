const UserService = (() => {
  const ALLOWED = ['OPERACIONAL','SUPERVISOR','ADMIN','CLIENTE'];

  function clean_(value) { return String(value == null ? '' : value).trim(); }
  function upper_(value) { return clean_(value).toUpperCase(); }

  function authenticate(input) {
    const matricula = clean_(input.matricula);
    const senha = String(input.senha || '');
    const hit = Repository.find('USUARIOS','MATRICULA',matricula);
    if (!hit || upper_(hit.record.ATIVO) !== 'SIM') throw new Error('Matrícula ou senha inválida.');
    if (!SecurityService.verify(senha, hit.record.SENHA_SALT, hit.record.SENHA_HASH)) throw new Error('Matrícula ou senha inválida.');

    Repository.update('USUARIOS', hit.rowNumber, { ULTIMO_LOGIN_EM: new Date() }, []);
    return {
      matricula,
      nome: clean_(hit.record.NOME),
      perfil: upper_(hit.record.PERFIL),
      trocaSenhaObrigatoria: upper_(hit.record.TROCA_SENHA_OBRIGATORIA) === 'SIM'
    };
  }

  function list() {
    return Repository.list('USUARIOS').map(x => ({
      matricula: clean_(x.record.MATRICULA),
      nome: clean_(x.record.NOME),
      perfil: upper_(x.record.PERFIL),
      ativo: upper_(x.record.ATIVO),
      trocaSenhaObrigatoria: upper_(x.record.TROCA_SENHA_OBRIGATORIA),
      ultimoLoginEm: x.record.ULTIMO_LOGIN_EM || '',
      versao: Number(x.record.VERSAO || 0),
      cnpjs: ClientBranchService.cnpjsForUser(clean_(x.record.MATRICULA), upper_(x.record.PERFIL))
    }));
  }

  function create(input) {
    const matricula = clean_(input.matricula);
    const nome = clean_(input.nome);
    const perfil = upper_(input.perfil);
    const senha = String(input.senhaTemporaria || '');
    const author = clean_(input.matriculaAutor);
    const cnpjs = ClientBranchService.validateAssignments(perfil, input.cnpjs);

    if (!matricula) throw new Error('Informe a matrícula.');
    if (!nome) throw new Error('Informe o nome.');
    if (ALLOWED.indexOf(perfil) < 0) throw new Error('Perfil inválido.');
    if (Repository.find('USUARIOS','MATRICULA',matricula)) throw new Error('Matrícula já cadastrada.');

    const credential = SecurityService.makePassword(senha);
    const now = new Date();
    Repository.append('USUARIOS', {
      MATRICULA: matricula,
      NOME: nome,
      PERFIL: perfil,
      SENHA_HASH: credential.hash,
      SENHA_SALT: credential.salt,
      TROCA_SENHA_OBRIGATORIA: 'SIM',
      ATIVO: 'SIM',
      CRIADO_EM: now,
      CRIADO_POR: author,
      ATUALIZADO_EM: now,
      ATUALIZADO_POR: author,
      ULTIMO_LOGIN_EM: '',
      VERSAO: 1
    }, ['MATRICULA','CRIADO_POR','ATUALIZADO_POR']);

    ClientBranchService.setAssignments({
      matricula,
      perfil,
      cnpjs,
      matriculaAutor: author
    });

    AuditService.log('USUARIO', matricula, 'CRIAR', author, null, { matricula, nome, perfil, ativo:'SIM', cnpjs }, null, 1);
    return { ok: true, user: { matricula, nome, perfil, ativo:'SIM', versao:1, cnpjs } };
  }

  function update(input) {
    const matricula = clean_(input.matricula);
    const hit = Repository.find('USUARIOS','MATRICULA',matricula);
    if (!hit) throw new Error('Usuário não encontrado.');

    const perfil = upper_(input.perfil);
    const ativo = upper_(input.ativo);
    const cnpjs = ClientBranchService.validateAssignments(perfil, input.cnpjs);
    if (ALLOWED.indexOf(perfil) < 0) throw new Error('Perfil inválido.');
    if (['SIM','NAO'].indexOf(ativo) < 0) throw new Error('Status inválido.');

    const oldVersion = Number(hit.record.VERSAO || 0);
    const informedVersion = Number(input.versao || 0);
    if (oldVersion !== informedVersion) throw new Error('O usuário foi alterado por outra sessão. Atualize a lista.');

    const before = {
      matricula,
      nome:clean_(hit.record.NOME),
      perfil:upper_(hit.record.PERFIL),
      ativo:upper_(hit.record.ATIVO),
      cnpjs: ClientBranchService.cnpjsForUser(matricula, upper_(hit.record.PERFIL))
    };
    const newVersion = oldVersion + 1;
    Repository.update('USUARIOS', hit.rowNumber, {
      PERFIL: perfil,
      ATIVO: ativo,
      ATUALIZADO_EM: new Date(),
      ATUALIZADO_POR: clean_(input.matriculaAutor),
      VERSAO: newVersion
    }, ['ATUALIZADO_POR']);

    ClientBranchService.setAssignments({
      matricula,
      perfil,
      cnpjs,
      matriculaAutor: clean_(input.matriculaAutor)
    });

    const after = { matricula, nome:clean_(hit.record.NOME), perfil, ativo, cnpjs };
    AuditService.log('USUARIO', matricula, 'ATUALIZAR', clean_(input.matriculaAutor), before, after, oldVersion, newVersion);
    return { ok:true, user:Object.assign({}, after, { versao:newVersion }) };
  }

  function changePassword(input) {
    const matricula = clean_(input.matricula);
    const newPassword = String(input.novaSenha || '');
    const hit = Repository.find('USUARIOS','MATRICULA',matricula);
    if (!hit) throw new Error('Usuário não encontrado.');
    const credential = SecurityService.makePassword(newPassword);
    const oldVersion = Number(hit.record.VERSAO || 0);
    const version = oldVersion + 1;
    Repository.update('USUARIOS', hit.rowNumber, {
      SENHA_HASH: credential.hash,
      SENHA_SALT: credential.salt,
      TROCA_SENHA_OBRIGATORIA: 'NAO',
      ATUALIZADO_EM: new Date(),
      ATUALIZADO_POR: matricula,
      VERSAO: version
    }, []);
    AuditService.log('USUARIO', matricula, 'TROCAR_SENHA', matricula, null, { trocaSenhaObrigatoria:'NAO' }, oldVersion, version);
    return { ok: true };
  }

  return { authenticate, list, create, update, changePassword };
})();
