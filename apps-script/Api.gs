const API_VERSION = '2026.10.05.3';

function doGet(e) {
  const route = String((e && e.parameter && e.parameter.route) || '').trim().toLowerCase();
  if (!route || route === 'health') {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        service: 'retrabalho-controle-unilog-api',
        version: API_VERSION
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: false,
      error: { message: 'Rota GET inválida: ' + route }
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Ações somente leitura não disputam o lock. Todas as demais escrevem na planilha.
const READ_ONLY_ACTIONS_ = {
  bootstrap: ['CARREGAR', 'COMPETENCIA'],
  retrabalhos: ['LISTAR', 'MESES'],
  maodeobra: ['LISTAR'],
  precos: ['LISTAR'],
  usuarios: ['LISTAR'],
  filiais: ['LISTAR', 'LISTAR_TODAS'],
  audit: ['LISTAR']
};

function isReadOnly_(route, action) {
  return (READ_ONLY_ACTIONS_[route] || []).indexOf(action) >= 0;
}

function doPost(e) {
  let lock = null;
  try {
    const route = String((e && e.parameter && e.parameter.route) || '').trim().toLowerCase();
    const payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    validateGateway_(payload);
    const action = String(payload.acao || '').toUpperCase();

    // Serializa gravações: Repository.append usa getLastRow()+1, e duas gravações
    // simultâneas sem lock podiam escrever na mesma linha (perda de dado), além de
    // furar as checagens de REQUEST_ID e de "um registro por dia/filial".
    if (!isReadOnly_(route, action)) {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(20000)) {
        throw new Error('O sistema está processando outra gravação. Aguarde alguns segundos e tente novamente.');
      }
    }

    return route_(route, action, payload);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok:false,
        error:{ message: error && error.message ? error.message : String(error) }
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock) {
      try { SpreadsheetApp.flush(); } catch (flushError) { /* sem planilha aberta */ }
      lock.releaseLock();
    }
  }
}

function route_(route, action, payload) {
  if (route === 'auth') {
    if (action === 'LOGIN') return ok_({ user: UserService.authenticate(payload) });
    if (action === 'TROCAR_SENHA') return ok_(UserService.changePassword(payload));
    throw new Error('Ação de autenticação inválida.');
  }

  if (route === 'bootstrap') {
    if (action === 'CARREGAR') return ok_(BootstrapService.load(payload));
    if (action === 'COMPETENCIA') return ok_(BootstrapService.period(payload));
    throw new Error('Ação de bootstrap inválida.');
  }

  if (route === 'retrabalhos') {
    if (action === 'LISTAR') return ok_({ data: ReworkService.list(payload.mes, payload.matriculaAutor, payload.perfilAutor) });
    if (action === 'MESES') return ok_({ data: ReworkService.months(payload.matriculaAutor, payload.perfilAutor) });
    if (action === 'CRIAR') return ok_(ReworkService.create(payload));
    if (action === 'EDITAR') return ok_(ReworkService.edit(payload));
    if (action === 'CANCELAR_COBRANCA') return ok_(ReworkService.cancelCharge(payload));
    throw new Error('Ação de retrabalho inválida.');
  }

  if (route === 'maodeobra') {
    if (action === 'LISTAR') return ok_({ data: LaborService.list(payload.matriculaAutor, payload.perfilAutor) });
    if (action === 'CRIAR') return ok_(LaborService.create(payload));
    if (action === 'EDITAR') return ok_(LaborService.edit(payload));
    throw new Error('Ação de mão de obra inválida.');
  }

  if (route === 'precos') {
    if (action === 'LISTAR') return ok_({ data: PriceService.list() });
    if (action === 'CRIAR_VIGENCIA') return ok_(PriceService.create(payload));
    throw new Error('Ação de preço inválida.');
  }

  if (route === 'usuarios') {
    if (action === 'LISTAR') return ok_({ data: UserService.list() });
    if (action === 'CRIAR') return ok_(UserService.create(payload));
    if (action === 'ATUALIZAR') return ok_(UserService.update(payload));
    throw new Error('Ação de usuário inválida.');
  }

  if (route === 'filiais') {
    const perfil = String(payload.perfilAutor || '').toUpperCase();
    if (action === 'LISTAR') {
      return ok_({ data: ClientBranchService.availableForUser(payload.matriculaAutor, perfil) });
    }
    if (action === 'LISTAR_TODAS') {
      if (perfil !== 'ADMIN') throw new Error('Sem permissão.');
      return ok_({ data: ClientBranchService.allActive() });
    }
    throw new Error('Ação de filial inválida.');
  }

  if (route === 'audit') {
    if (action === 'LISTAR') {
      return ok_({ data: AuditService.list(payload.mes, payload.matriculaAutor, payload.perfilAutor) });
    }
    throw new Error('Ação de auditoria inválida.');
  }

  throw new Error('Rota inválida.');
}

function validateGateway_(payload) {
  if (!payload || String(payload._gatewayToken || '') !== AppConfig.gatewayToken()) {
    throw new Error('Gateway não autorizado.');
  }
}

function ok_(payload) {
  const result = Object.assign({ ok:true }, payload || {});
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function bootstrapAdmin(matricula, nome, senhaTemporaria) {
  if (Repository.list('USUARIOS').length > 0) {
    throw new Error('Bootstrap bloqueado: já existem usuários cadastrados.');
  }
  return UserService.create({
    matricula,
    nome,
    perfil:'ADMIN',
    senhaTemporaria,
    matriculaAutor: matricula
  });
}

function bootstrapAdminFromProperties() {
  const props = PropertiesService.getScriptProperties();
  const matricula = String(props.getProperty('BOOTSTRAP_ADMIN_MATRICULA') || '').trim();
  const nome = String(props.getProperty('BOOTSTRAP_ADMIN_NOME') || '').trim();
  const senhaTemporaria = String(props.getProperty('BOOTSTRAP_ADMIN_PASSWORD') || '');

  if (!matricula || !nome || !senhaTemporaria) {
    throw new Error(
      'Configure BOOTSTRAP_ADMIN_MATRICULA, BOOTSTRAP_ADMIN_NOME e BOOTSTRAP_ADMIN_PASSWORD nas Script Properties.'
    );
  }

  const result = bootstrapAdmin(matricula, nome, senhaTemporaria);

  props.deleteProperty('BOOTSTRAP_ADMIN_MATRICULA');
  props.deleteProperty('BOOTSTRAP_ADMIN_NOME');
  props.deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');

  return result;
}
