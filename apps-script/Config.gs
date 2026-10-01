const AppConfig = (() => {
  const SPREADSHEET_PROPERTY = 'SPREADSHEET_ID';
  const GATEWAY_TOKEN_PROPERTY = 'GATEWAY_TOKEN';
  const PASSWORD_PEPPER_PROPERTY = 'AUTH_PASSWORD_PEPPER';
  const TIMEZONE = 'America/Sao_Paulo';

  function property_(name) {
    const value = PropertiesService.getScriptProperties().getProperty(name);
    if (!value) throw new Error('Propriedade de script não configurada: ' + name);
    return value;
  }

  function spreadsheetId() { return property_(SPREADSHEET_PROPERTY); }
  function gatewayToken() { return property_(GATEWAY_TOKEN_PROPERTY); }
  function passwordPepper() { return property_(PASSWORD_PEPPER_PROPERTY); }

  return { spreadsheetId, gatewayToken, passwordPepper, TIMEZONE };
})();
