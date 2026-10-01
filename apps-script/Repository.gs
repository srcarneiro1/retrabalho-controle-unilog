const Repository = (() => {
  let ss_ = null;

  function ss() {
    if (!ss_) ss_ = SpreadsheetApp.openById(AppConfig.spreadsheetId());
    return ss_;
  }

  function sheet(name) {
    const sh = ss().getSheetByName(name);
    if (!sh) throw new Error('Aba não encontrada: ' + name);
    return sh;
  }

  function headers(name) {
    const sh = sheet(name);
    const cols = sh.getLastColumn();
    if (cols < 1) return [];
    return sh.getRange(1, 1, 1, cols).getDisplayValues()[0].map(String);
  }

  function rowObject(name, rowNumber) {
    const sh = sheet(name);
    const hs = headers(name);
    const values = sh.getRange(rowNumber, 1, 1, hs.length).getValues()[0];
    return hs.reduce((o, h, i) => { if (h) o[h] = values[i]; return o; }, {});
  }

  function list(name) {
    const sh = sheet(name);
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return [];
    const hs = headers(name);
    return sh.getRange(2,1,lastRow-1,hs.length).getValues()
      .map((row, idx) => ({ rowNumber: idx + 2, record: hs.reduce((o,h,i)=>{ if(h) o[h]=row[i]; return o; },{}) }))
      .filter(x => Object.values(x.record).some(v => v !== '' && v !== null));
  }

  function find(name, field, value) {
    const sh = sheet(name);
    const hs = headers(name);
    const idx = hs.indexOf(field);
    if (idx < 0) throw new Error('Campo não encontrado em ' + name + ': ' + field);
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) return null;
    const target = String(value == null ? '' : value).trim();
    if (!target) return null;
    const found = sh.getRange(2, idx + 1, lastRow - 1, 1).createTextFinder(target).matchEntireCell(true).matchCase(true).findNext();
    if (!found) return null;
    return { rowNumber: found.getRow(), record: rowObject(name, found.getRow()) };
  }

  function append(name, record, textFields) {
    const sh = sheet(name);
    const hs = headers(name);
    const rowNumber = sh.getLastRow() + 1;
    const row = hs.map(h => Object.prototype.hasOwnProperty.call(record, h) ? record[h] : '');
    (textFields || []).forEach(field => {
      const idx = hs.indexOf(field);
      if (idx >= 0) sh.getRange(rowNumber, idx + 1).setNumberFormat('@');
    });
    sh.getRange(rowNumber, 1, 1, hs.length).setValues([row]);
    return rowNumber;
  }

  function update(name, rowNumber, updates, textFields) {
    const sh = sheet(name);
    const hs = headers(name);
    Object.keys(updates).forEach(field => {
      const idx = hs.indexOf(field);
      if (idx < 0) throw new Error('Campo não encontrado em ' + name + ': ' + field);
      const cell = sh.getRange(rowNumber, idx + 1);
      if ((textFields || []).indexOf(field) >= 0) cell.setNumberFormat('@');
      cell.setValue(updates[field]);
    });
  }

  return { sheet, headers, rowObject, list, find, append, update };
})();
