const PriceService = (() => {
  function text_(v) { return String(v == null ? '' : v).trim(); }

  function parseDate_(v, label) {
    const s = text_(v);
    const p = s.split('-').map(Number);
    if (!s || p.length !== 3 || !p[0] || !p[1] || !p[2]) throw new Error(label + ' inválida.');
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function dateOnly_(v) {
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }
    return parseDate_(String(v), 'Data');
  }

  function iso_(v) {
    if (!v) return '';
    const d = dateOnly_(v);
    return Utilities.formatDate(d, AppConfig.TIMEZONE, 'yyyy-MM-dd');
  }

  function money_(v, label) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(label + ' inválido.');
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function dayBefore_(d) {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    copy.setDate(copy.getDate() - 1);
    return copy;
  }

  function map_(r) {
    return {
      id: text_(r.ID_PRECO),
      vigenciaInicio: iso_(r.VIGENCIA_INICIO),
      vigenciaFim: iso_(r.VIGENCIA_FIM),
      valorNacionalizacao: Number(r.VALOR_NACIONALIZACAO || 0),
      valorRfidAdicional: Number(r.VALOR_RFID_ADICIONAL || 0),
      ativo: text_(r.ATIVO) || 'SIM',
      criadoEm: r.CRIADO_EM || '',
      criadoPor: text_(r.CRIADO_POR),
      observacao: text_(r.OBSERVACAO),
      versao: Number(r.VERSAO || 0),
      requestId: text_(r.REQUEST_ID)
    };
  }

  function rows_() {
    return Repository.list('TABELA_PRECOS')
      .map(x => ({ rowNumber: x.rowNumber, record: x.record, mapped: map_(x.record) }))
      .filter(x => x.mapped.ativo !== 'NAO')
      .sort((a,b) => a.mapped.vigenciaInicio.localeCompare(b.mapped.vigenciaInicio));
  }

  function list() {
    return rows_().map(x => x.mapped).reverse();
  }

  function findByDate(dateValue) {
    const target = dateOnly_(dateValue);
    const rows = rows_();
    for (let i = rows.length - 1; i >= 0; i--) {
      const start = dateOnly_(rows[i].record.VIGENCIA_INICIO);
      const end = rows[i].record.VIGENCIA_FIM ? dateOnly_(rows[i].record.VIGENCIA_FIM) : null;
      if (target >= start && (!end || target <= end)) return rows[i].mapped;
    }
    throw new Error('Não existe preço vigente para a data de efetivação informada.');
  }

  function calculate(dateValue, nacionalizacao, rfid) {
    const price = findByDate(dateValue);
    const natQty = Number(nacionalizacao || 0);
    const rfidQty = Number(rfid || 0);
    const valueNat = money_(natQty * price.valorNacionalizacao, 'Valor de nacionalização');
    const valueRfid = money_(rfidQty * price.valorRfidAdicional, 'Valor adicional RFID');
    return {
      idPreco: price.id,
      precoNacionalizacaoUnit: price.valorNacionalizacao,
      precoRfidAdicionalUnit: price.valorRfidAdicional,
      valorNacionalizacao: valueNat,
      valorRfidAdicional: valueRfid,
      valorTotalCobranca: money_(valueNat + valueRfid, 'Valor total')
    };
  }

  function create(input) {
    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    const prior = Repository.find('TABELA_PRECOS', 'REQUEST_ID', requestId);
    if (prior) return { ok:true, data:map_(prior.record), idempotent:true };

    const start = parseDate_(input.vigenciaInicio, 'Vigência inicial');
    const valueNat = money_(input.valorNacionalizacao, 'Valor de nacionalização');
    const valueRfid = money_(input.valorRfidAdicional, 'Valor adicional RFID');
    const author = text_(input.matriculaAutor);
    const observation = text_(input.observacao);
    const rows = rows_();

    if (rows.some(x => iso_(x.record.VIGENCIA_INICIO) === iso_(start))) {
      throw new Error('Já existe uma tabela de preços iniciando nessa data.');
    }

    let previous = null;
    let next = null;
    rows.forEach(x => {
      const d = dateOnly_(x.record.VIGENCIA_INICIO);
      if (d < start) previous = x;
      if (!next && d > start) next = x;
    });

    if (previous) {
      const before = previous.mapped;
      const nextVersion = Number(previous.record.VERSAO || 0) + 1;
      Repository.update('TABELA_PRECOS', previous.rowNumber, {
        VIGENCIA_FIM: dayBefore_(start),
        VERSAO: nextVersion
      }, []);
      const after = map_(Repository.rowObject('TABELA_PRECOS', previous.rowNumber));
      AuditService.log('PRECO', previous.mapped.id, 'ENCERRAR_VIGENCIA', author, before, after, before.versao, nextVersion);
    }

    const now = new Date();
    const id = 'PR-' + Utilities.formatDate(start, AppConfig.TIMEZONE, 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0,6).toUpperCase();
    const record = {
      ID_PRECO: id,
      VIGENCIA_INICIO: start,
      VIGENCIA_FIM: next ? dayBefore_(dateOnly_(next.record.VIGENCIA_INICIO)) : '',
      VALOR_NACIONALIZACAO: valueNat,
      VALOR_RFID_ADICIONAL: valueRfid,
      ATIVO: 'SIM',
      CRIADO_EM: now,
      CRIADO_POR: author,
      OBSERVACAO: observation,
      VERSAO: 1,
      REQUEST_ID: requestId
    };

    Repository.append('TABELA_PRECOS', record, ['ID_PRECO','CRIADO_POR','REQUEST_ID']);
    const mapped = map_(record);
    AuditService.log('PRECO', id, 'CRIAR_VIGENCIA', author, null, mapped, null, 1);
    return { ok:true, data:mapped };
  }

  return { list, findByDate, calculate, create };
})();