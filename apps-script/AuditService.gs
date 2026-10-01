const AuditService = (() => {
  function uuid_() { return Utilities.getUuid(); }
  function now_() { return new Date(); }

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

  function list() {
    return Repository.list('AUDITORIA').map(x => ({
      idAuditoria: x.record.ID_AUDITORIA,
      entidade: x.record.ENTIDADE,
      idRegistro: x.record.ID_REGISTRO,
      acao: x.record.ACAO,
      matriculaAutor: x.record.MATRICULA_AUTOR,
      dataHora: formatDateTime_(x.record.DATA_HORA),
      versaoAnterior: x.record.VERSAO_ANTERIOR,
      versaoNova: x.record.VERSAO_NOVA
    })).reverse();
  }

  function formatDateTime_(value) {
    if (!value) return '';
    const d = Object.prototype.toString.call(value) === '[object Date]' ? value : new Date(value);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  }

  return { log, list };
})();
