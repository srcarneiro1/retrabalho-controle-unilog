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

  function decimal_(v, label, decimals) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(label + ' inválido.');
    const factor = Math.pow(10, decimals);
    return Math.round((n + Number.EPSILON) * factor) / factor;
  }

  function rate_(v, label) {
    return decimal_(v, label, 4);
  }

  function amount_(v, label) {
    return decimal_(v, label, 4);
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
      valorValidade: Number(r.VALOR_VALIDADE || 0),
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

  function calculate(dateValue, nacionalizacao, rfid, validade) {
    const price = findByDate(dateValue);
    const natQty = Number(nacionalizacao || 0);
    const rfidQty = Number(rfid || 0);
    const validadeQty = Number(validade || 0);

    const valueNat = amount_(natQty * price.valorNacionalizacao, 'Valor de nacionalização');
    const valueRfid = amount_(rfidQty * price.valorRfidAdicional, 'Valor RFID/ADIPAC');
    const valueValidade = amount_(validadeQty * price.valorValidade, 'Valor de etiqueta de validade');

    return {
      idPreco: price.id,
      precoNacionalizacaoUnit: rate_(price.valorNacionalizacao, 'Tarifa de nacionalização'),
      precoRfidAdicionalUnit: rate_(price.valorRfidAdicional, 'Tarifa RFID/ADIPAC'),
      precoValidadeUnit: rate_(price.valorValidade, 'Tarifa de etiqueta de validade'),
      valorNacionalizacao: valueNat,
      valorRfidAdicional: valueRfid,
      valorValidade: valueValidade,
      valorTotalCobranca: amount_(valueNat + valueRfid + valueValidade, 'Valor total')
    };
  }

  function create(input) {
    const requestId = text_(input.requestId);
    if (!requestId) throw new Error('Identificador da requisição ausente.');

    const prior = Repository.find('TABELA_PRECOS', 'REQUEST_ID', requestId);
    if (prior) return { ok:true, data:map_(prior.record), idempotent:true };

    const start = parseDate_(input.vigenciaInicio, 'Vigência inicial');
    const valueNat = rate_(input.valorNacionalizacao, 'Tarifa de nacionalização');
    const valueRfid = rate_(input.valorRfidAdicional, 'Tarifa RFID/ADIPAC');
    // Etiqueta de Validade foi descontinuada: novas vigências gravam 0 quando não informada.
    const valueValidade = rate_(
      input.valorValidade == null || input.valorValidade === '' ? 0 : input.valorValidade,
      'Tarifa de etiqueta de validade'
    );
    const author = text_(input.matriculaAutor);
    const observation = text_(input.observacao);
    const rows = rows_();

    if (rows.some(x => iso_(x.record.VIGENCIA_INICIO) === iso_(start))) {
      throw new Error('Já existe uma tabela de preços iniciando nessa data.');
    }

    const latest = rows.length ? rows[rows.length - 1] : null;
    if (latest) {
      const latestStart = dateOnly_(latest.record.VIGENCIA_INICIO);
      if (start <= latestStart) {
        throw new Error('A nova vigência deve iniciar depois da última vigência cadastrada.');
      }

      const before = latest.mapped;
      const nextVersion = Number(latest.record.VERSAO || 0) + 1;
      Repository.update('TABELA_PRECOS', latest.rowNumber, {
        VIGENCIA_FIM: dayBefore_(start),
        VERSAO: nextVersion
      }, []);
      const after = map_(Repository.rowObject('TABELA_PRECOS', latest.rowNumber));
      AuditService.log('PRECO', latest.mapped.id, 'ENCERRAR_VIGENCIA', author, before, after, before.versao, nextVersion);
    }

    const now = new Date();
    const id = 'PR-' + Utilities.formatDate(start, AppConfig.TIMEZONE, 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0,6).toUpperCase();
    const record = {
      ID_PRECO: id,
      VIGENCIA_INICIO: start,
      VIGENCIA_FIM: '',
      VALOR_NACIONALIZACAO: valueNat,
      VALOR_RFID_ADICIONAL: valueRfid,
      ATIVO: 'SIM',
      CRIADO_EM: now,
      CRIADO_POR: author,
      OBSERVACAO: observation,
      VERSAO: 1,
      REQUEST_ID: requestId,
      VALOR_VALIDADE: valueValidade
    };

    Repository.append('TABELA_PRECOS', record, ['ID_PRECO','CRIADO_POR','REQUEST_ID']);
    const mapped = map_(record);
    AuditService.log('PRECO', id, 'CRIAR_VIGENCIA', author, null, mapped, null, 1);
    return { ok:true, data:mapped };
  }

  return { list, findByDate, calculate, create };
})();
