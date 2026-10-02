const Repository = (() => {
  let ss_ = null;
  const headersCache_ = {};
  const listCache_ = {};

  function ss() {
    if (!ss_) ss_ = SpreadsheetApp.openById(AppConfig.spreadsheetId());
    return ss_;
  }

  function sheet(name) {
    const sh = ss().getSheetByName(name);
    if (!sh) throw new Error('Aba não encontrada: ' + name);
    return sh;
  }

  function cloneRows_(rows) {
    return rows.map(x => ({
      rowNumber: x.rowNumber,
      record: Object.assign({}, x.record)
    }));
  }

  function headers(name) {
    if (headersCache_[name]) return headersCache_[name].slice();
    const sh = sheet(name);
    const cols = sh.getLastColumn();
    if (cols < 1) return [];
    const result = sh.getRange(1, 1, 1, cols).getDisplayValues()[0].map(String);
    headersCache_[name] = result.slice();
    return result;
  }

  function rowObject(name, rowNumber) {
    const sh = sheet(name);
    const hs = headers(name);
    const values = sh.getRange(rowNumber, 1, 1, hs.length).getValues()[0];
    return hs.reduce((o, h, i) => { if (h) o[h] = values[i]; return o; }, {});
  }

  function list(name) {
    if (listCache_[name]) return cloneRows_(listCache_[name]);

    const sh = sheet(name);
    const lastRow = sh.getLastRow();
    if (lastRow <= 1) {
      listCache_[name] = [];
      return [];
    }

    const hs = headers(name);
    const result = sh.getRange(2,1,lastRow-1,hs.length).getValues()
      .map((row, idx) => ({
        rowNumber: idx + 2,
        record: hs.reduce((o,h,i)=>{ if(h) o[h]=row[i]; return o; },{})
      }))
      .filter(x => Object.values(x.record).some(v => v !== '' && v !== null));

    listCache_[name] = result;
    return cloneRows_(result);
  }

  function find(name, field, value) {
    const hs = headers(name);
    const idx = hs.indexOf(field);
    if (idx < 0) throw new Error('Campo não encontrado em ' + name + ': ' + field);

    const target = String(value == null ? '' : value).trim();
    if (!target) return null;

    const cached = list(name);
    const hit = cached.find(x => String(x.record[field] == null ? '' : x.record[field]).trim() === target);
    return hit ? { rowNumber: hit.rowNumber, record: Object.assign({}, hit.record) } : null;
  }

  function invalidate_(name) {
    delete listCache_[name];
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
    invalidate_(name);
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
    invalidate_(name);
  }

  return { sheet, headers, rowObject, list, find, append, update };
})();
