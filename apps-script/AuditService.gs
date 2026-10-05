const AuditService = (() => {
  function uuid_() { return Utilities.getUuid(); }
  function now_() { return new Date(); }
  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }

  function log(entity, id, action, author, beforeData, afterData, oldVersion, newVersion) {
    Repository.append('AUDITORIA', {
      ID_AUDITORIA: uuid_(),
      ENTIDADE: entity,
      ID_REGISTRO: id,
      ACAO: action,
      MATRICULA_AUTOR: author,
      DATA_HORA: now_(),
      VERSAO_ANTERIOR: oldVersion == null ? '' : oldVersion,
      VERSAO_NOVA: newVersion == null ? '' : newVersion,
      DADOS_ANTES_JSON: beforeData ? JSON.stringify(beforeData) : '',
      DADOS_DEPOIS_JSON: afterData ? JSON.stringify(afterData) : '',
      ORIGEM: 'WEB_APP'
    }, ['ID_AUDITORIA','ID_REGISTRO','MATRICULA_AUTOR']);
  }

  // entries: [{ entity, id, action, author, before, after, oldVersion, newVersion }]
  function logMany(entries) {
    const now = now_();
    Repository.appendMany('AUDITORIA', (entries || []).map(e => ({
      ID_AUDITORIA: uuid_(),
      ENTIDADE: e.entity,
      ID_REGISTRO: e.id,
      ACAO: e.action,
      MATRICULA_AUTOR: e.author,
      DATA_HORA: now,
      VERSAO_ANTERIOR: e.oldVersion == null ? '' : e.oldVersion,
      VERSAO_NOVA: e.newVersion == null ? '' : e.newVersion,
      DADOS_ANTES_JSON: e.before ? JSON.stringify(e.before) : '',
      DADOS_DEPOIS_JSON: e.after ? JSON.stringify(e.after) : '',
      ORIGEM: 'WEB_APP'
    })), ['ID_AUDITORIA','ID_REGISTRO','MATRICULA_AUTOR']);
  }

  function eventMonth_(value) {
    if (!value) return '';
    const d = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, AppConfig.TIMEZONE, 'yyyy-MM');
  }

  // CLIENTE: eventos dos registros da competência (mês do lançamento).
  // Perfis internos com mês: eventos OCORRIDOS no mês (data/hora do evento), de registros
  // do escopo em qualquer competência. ADMIN vê todas as entidades.
  function list(month, matricula, perfil) {
    const filterMonth = /^\d{4}-\d{2}$/.test(text_(month)) ? text_(month) : '';
    const profile = upper_(perfil);
    const byEventMonth = Boolean(filterMonth) && profile !== 'CLIENTE';
    const scopedIds = ReworkService.idsForScope(byEventMonth ? '' : filterMonth, matricula, profile);
    const allowed = {};
    scopedIds.forEach(id => { allowed[id] = true; });

    // Perfis internos também enxergam a auditoria de mão de obra das suas filiais.
    const laborAllowed = {};
    if (profile === 'SUPERVISOR' || profile === 'ADMIN') {
      try {
        LaborService.idsForScope(matricula, profile).forEach(id => { laborAllowed[id] = true; });
      } catch (error) { /* aba ainda inexistente */ }
    }

    return Repository.list('AUDITORIA')
      .filter(x => !byEventMonth || eventMonth_(x.record.DATA_HORA) === filterMonth)
      .map(x => ({
        idAuditoria: text_(x.record.ID_AUDITORIA),
        entidade: text_(x.record.ENTIDADE),
        idRegistro: text_(x.record.ID_REGISTRO),
        acao: text_(x.record.ACAO),
        matriculaAutor: text_(x.record.MATRICULA_AUTOR),
        dataHora: formatDateTime_(x.record.DATA_HORA),
        versaoAnterior: x.record.VERSAO_ANTERIOR,
        versaoNova: x.record.VERSAO_NOVA,
        dadosAntes: text_(x.record.DADOS_ANTES_JSON),
        dadosDepois: text_(x.record.DADOS_DEPOIS_JSON),
        origem: text_(x.record.ORIGEM)
      }))
      .filter(item => {
        if (profile === 'ADMIN' && (!filterMonth || byEventMonth)) return true;
        if (item.entidade === 'MAO_DE_OBRA') return Boolean(laborAllowed[item.idRegistro]);
        return item.entidade === 'RETRABALHO' && Boolean(allowed[item.idRegistro]);
      })
      .reverse();
  }

  function formatDateTime_(value) {
    if (!value) return '';
    const d = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  }

  return { log, logMany, list };
})();
