function doPost(e) {
  try {
    const route = String((e && e.parameter && e.parameter.route) || '').trim().toLowerCase();
    const payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    validateGateway_(payload);

    if (route === 'auth') {
      const action = String(payload.acao || '').toUpperCase();
      if (action === 'LOGIN') return ok_({ user: UserService.authenticate(payload) });
      if (action === 'TROCAR_SENHA') return ok_(UserService.changePassword(payload));
      throw new Error('Ação de autenticação inválida.');
    }

    if (route === 'retrabalhos') {
      const action = String(payload.acao || '').toUpperCase();
      if (action === 'LISTAR') return ok_({ data: ReworkService.list() });
      if (action === 'CRIAR') return ok_(ReworkService.create(payload));
      if (action === 'EDITAR') return ok_(ReworkService.edit(payload));
      throw new Error('Ação de retrabalho inválida.');
    }

    if (route === 'usuarios') {
      const action = String(payload.acao || '').toUpperCase();
      if (action === 'LISTAR') return ok_({ data: UserService.list() });
      if (action === 'CRIAR') return ok_(UserService.create(payload));
      if (action === 'ATUALIZAR') return ok_(UserService.update(payload));
      throw new Error('Ação de usuário inválida.');
    }

    if (route === 'audit') {
      if (String(payload.acao || '').toUpperCase() === 'LISTAR') return ok_({ data: AuditService.list() });
      throw new Error('Ação de auditoria inválida.');
    }

    throw new Error('Rota inválida.');
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:{ message: error && error.message ? error.message : String(error) } })).setMimeType(ContentService.MimeType.JSON);
  }
}

function validateGateway_(payload) {
  if (!payload || String(payload._gatewayToken || '') !== AppConfig.gatewayToken()) throw new Error('Gateway não autorizado.');
}

function ok_(payload) {
  const result = Object.assign({ ok:true }, payload || {});
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function bootstrapAdmin(matricula, nome, senhaTemporaria) {
  if (Repository.list('USUARIOS').length > 0) throw new Error('Bootstrap bloqueado: já existem usuários cadastrados.');
  return UserService.create({ matricula, nome, perfil:'ADMIN', senhaTemporaria, matriculaAutor: matricula });
}
