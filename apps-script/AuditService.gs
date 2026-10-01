const AuditService = (() => {
  function uuid_() { return Utilities.getUuid(); }
  function now_() { return new Date(); }
  function text_(v) { return String(v == null ? '' : v).trim(); }

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

  function list(month) {
    const filterMonth = /^\d{4}-\d{2}$/.test(text_(month)) ? text_(month) : '';
    const allowedIds = filterMonth ? ReworkService.idsForMonth(filterMonth) : null;
    const allowed = {};
    if (allowedIds) allowedIds.forEach(id => { allowed[id] = true; });

    return Repository.list('AUDITORIA')
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
      .filter(item => !filterMonth || (item.entidade === 'RETRABALHO' && allowed[item.idRegistro]))
      .reverse();
  }

  function formatDateTime_(value) {
    if (!value) return '';
    const d = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  }

  return { log, list };
})();