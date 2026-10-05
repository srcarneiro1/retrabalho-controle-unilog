const BootstrapService = (() => {
  function text_(v) { return String(v == null ? '' : v).trim(); }
  function upper_(v) { return text_(v).toUpperCase(); }

  function currentMonth_() {
    return Utilities.formatDate(new Date(), AppConfig.TIMEZONE, 'yyyy-MM');
  }

  function monthFromItem_(item) {
    return String(item && item.dataEfetivacao || '').slice(0, 7);
  }

  function allowedAudit_(perfil) {
    return perfil === 'SUPERVISOR' || perfil === 'ADMIN' || perfil === 'CLIENTE';
  }

  function load(input) {
    const matricula = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);

    // Tabela de preços é interna: CLIENTE não recebe.
    const prices = perfil === 'CLIENTE' ? [] : PriceService.list();
    const branches = ClientBranchService.availableForUser(matricula, perfil);
    const allItems = ReworkService.list('', matricula, perfil);

    // Todos os perfis recebem só o mês selecionado (padrão: mês mais recente com dados).
    // O histórico completo é lido no servidor só para montar a lista de meses: o navegador
    // não baixa mais todo o histórico a cada login (~1 KB por lançamento).
    const seen = {};
    allItems.forEach(item => {
      const month = monthFromItem_(item);
      if (month) seen[month] = true;
    });
    const months = Object.keys(seen).sort().reverse();
    const requested = /^\d{4}-\d{2}$/.test(text_(input.mes)) ? text_(input.mes) : '';
    const selectedMonth = requested || months[0] || currentMonth_();
    const items = allItems.filter(item => monthFromItem_(item) === selectedMonth);

    // Auditoria: CLIENTE recebe a competência no bootstrap; perfis internos carregam
    // sob demanda, ao abrir a tela de Auditoria (por mês).
    const audits = perfil === 'CLIENTE' && allowedAudit_(perfil)
      ? AuditService.list(selectedMonth, matricula, perfil)
      : [];

    const result = {
      connected: true,
      apiVersion: typeof API_VERSION !== 'undefined' ? API_VERSION : '',
      prices,
      branches,
      items,
      audits,
      months,
      selectedMonth,
      allBranches: [],
      users: [],
      labor: []
    };

    result.processes = [];
    if (perfil !== 'CLIENTE') {
      try {
        result.processes = ProcessService.list(matricula, perfil);
      } catch (error) {
        result.processesError = error && error.message ? error.message : String(error);
      }
    }

    if (perfil !== 'CLIENTE') {
      // Falha na mão de obra não pode impedir o acesso ao restante do sistema.
      try {
        result.labor = LaborService.list(matricula, perfil);
      } catch (error) {
        result.labor = [];
        result.laborError = error && error.message ? error.message : String(error);
      }
    }

    if (perfil === 'ADMIN') {
      result.allBranches = ClientBranchService.allActive();
      result.users = UserService.list();
    }

    return result;
  }

  function period(input) {
    const matricula = text_(input.matriculaAutor);
    const perfil = upper_(input.perfilAutor);
    if (perfil !== 'CLIENTE') throw new Error('Atualização por competência disponível apenas para CLIENTE.');

    const month = text_(input.mes);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Competência mensal inválida.');

    return {
      connected: true,
      apiVersion: typeof API_VERSION !== 'undefined' ? API_VERSION : '',
      selectedMonth: month,
      items: ReworkService.list(month, matricula, perfil),
      audits: AuditService.list(month, matricula, perfil)
    };
  }

  return { load, period };
})();
