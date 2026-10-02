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

    const prices = PriceService.list();
    const branches = ClientBranchService.availableForUser(matricula, perfil);
    const allItems = ReworkService.list('', matricula, perfil);

    let items = allItems;
    let months = [];
    let selectedMonth = '';

    if (perfil === 'CLIENTE') {
      const seen = {};
      allItems.forEach(item => {
        const month = monthFromItem_(item);
        if (month) seen[month] = true;
      });
      months = Object.keys(seen).sort().reverse();

      const requested = /^\d{4}-\d{2}$/.test(text_(input.mes)) ? text_(input.mes) : '';
      selectedMonth = requested || months[0] || currentMonth_();
      items = allItems.filter(item => monthFromItem_(item) === selectedMonth);
    }

    const audits = allowedAudit_(perfil)
      ? AuditService.list(perfil === 'CLIENTE' ? selectedMonth : '', matricula, perfil)
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
      users: []
    };

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
