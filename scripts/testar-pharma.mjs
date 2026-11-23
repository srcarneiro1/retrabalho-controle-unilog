// Teste do fluxo PHARMAESTETICS executando os PRÓPRIOS arquivos .gs (Api, Repository, ClientBranchService,
// PharmaService e demais) com dublês mínimos das APIs do Google. Uso: node scripts/testar-pharma.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'

const PASTA = new URL('../apps-script/', import.meta.url)
const planilhas = {}  // id -> { abas: {nome: valores[][]} }
const conversoes = {} // nome do blob -> abas (simula o Excel convertido pelo Drive)
let ok = 0, falhas = 0
const checa = (nome, cond, extra = '') => { if (cond) { ok++; console.log('  OK  ', nome) } else { falhas++; console.log('  FALHA', nome, extra) } }

function aba(valores) {
  const s = {
    v: valores,
    getLastRow: () => s.v.length,
    getLastColumn: () => (s.v[0] || []).length,
    setFrozenRows: () => {},
    getDataRange: () => ({ getValues: () => s.v.map(l => l.slice()) }),
    getRange: (row, col, nr = 1, nc = 1) => {
      const bloco = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (s.v[row - 1 + i] || [])[col - 1 + j] ?? ''))
      const r = {
        getValues: () => bloco(),
        getDisplayValues: () => bloco().map(l => l.map(x => (x instanceof Date ? x.toISOString() : String(x ?? '')))),
        setValues: (vals) => { vals.forEach((l, i) => l.forEach((x, j) => { while (s.v.length < row + i) s.v.push([]); s.v[row - 1 + i][col - 1 + j] = x })); return r },
        setValue: (x) => r.setValues([[x]]),
        setNumberFormat: () => r, setNumberFormats: () => r,
      }
      return r
    },
  }
  return s
}
function planilha(abas) {
  const p = { abas: Object.fromEntries(Object.entries(abas).map(([n, v]) => [n, aba(v)])) }
  return {
    p,
    getSheetByName: (n) => p.abas[n] || null,
    insertSheet: (n) => (p.abas[n] = aba([])),
    getSheets: () => Object.values(p.abas),
  }
}
const real = planilha({
  CLIENTES_FILIAIS: [['CNPJ', 'NOME_CLIENTE', 'FILIAL', 'ATIVO'], ['11111111000111', 'PHARMAESTETICS', 'MATRIZ', 'SIM'], ['22222222000122', 'ACESS', 'MATRIZ', 'SIM']],
  USUARIO_FILIAIS: [['MATRICULA', 'CNPJ', 'ATIVO'], ['300', '11111111000111', 'SIM'], ['200', '11111111000111', 'SIM'], ['200', '22222222000122', 'SIM'], ['400', '22222222000122', 'SIM']],
  AUDITORIA: [['ID_AUDITORIA', 'DATA_HORA', 'MATRICULA_AUTOR', 'ENTIDADE', 'ID_REGISTRO', 'ACAO'], ['AU-1', 'x', '100', 'RETRABALHO', 'RT-1', 'CRIAR']],
  RETRABALHOS: [['ID_RETRABALHO', 'CNPJ_CLIENTE'], ['RT-1', '22222222000122']],
})
planilhas.REAL = real
const fotoAntes = JSON.stringify(['CLIENTES_FILIAIS', 'USUARIO_FILIAIS', 'AUDITORIA', 'RETRABALHOS'].map(n => real.p.abas[n].v))
const props = { SPREADSHEET_ID: 'REAL', GATEWAY_TOKEN: 'tk', AUTH_PASSWORD_PEPPER: 'p'.repeat(32) }
const pad = (n) => String(n).padStart(2, '0')
const ctx = {
  console: { log: () => {}, error: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
  SpreadsheetApp: { openById: (id) => planilhas[id], flush: () => {} },
  Utilities: {
    formatDate: (d, _tz, f) => f.replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())),
    getUuid: () => randomUUID(),
    base64Decode: (t) => [...Buffer.from(t, 'base64')],
    newBlob: (bytes, mime, nome) => ({ nome, mime, bytes }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
  MimeType: { GOOGLE_SHEETS: 'gsheet', CSV: 'csv' },
  Drive: { Files: { create: (meta, blob) => { const id = 'conv-' + randomUUID(); planilhas[id] = planilha(conversoes[blob.nome]); return { id } }, remove: () => {} } },
  DriveApp: { getFileById: () => ({ setTrashed: () => {} }) },
}
vm.createContext(ctx)
for (const f of readdirSync(PASTA).filter(f => f.endsWith('.gs')).sort((a, b) => (a === 'Api.gs') - (b === 'Api.gs'))) {
  vm.runInContext(readFileSync(new URL(f, PASTA), 'utf8').replace(/^const (\w+) = /gm, 'var $1 = '), ctx, { filename: f })
}
const post = (acao, perfil, matricula, extra = {}) => ctx.doPost({ parameter: { route: 'pharma' }, postData: { contents: JSON.stringify({ _gatewayToken: 'tk', acao, perfilAutor: perfil, matriculaAutor: matricula, ...extra }) } })
const erro = (r) => (r.ok ? '' : r.error.message)
const PE = '11111111000111', ACESS = '22222222000122'

console.log('1) Instalação')
ctx.setupPharmaEstetics()
checa('abas PE_* criadas', ['PE_FILIAIS', 'PE_PRODUTOS', 'PE_IMPORTACOES', 'PE_PRECOS', 'PE_LANCAMENTOS', 'PE_AUDITORIA'].every(n => real.p.abas[n]))
checa('tarifa inicial 0,80 / 0,60 / 12,00', JSON.stringify(real.p.abas.PE_PRECOS.v[1].slice(3, 6)) === '[0.8,0.6,12]')

console.log('2) Habilitar filial')
checa('SUPERVISOR não habilita', erro(post('HABILITAR_FILIAL', 'SUPERVISOR', '200', { cnpj: PE })) === 'Somente ADMIN habilita filiais.')
checa('CNPJ inexistente recusado', erro(post('HABILITAR_FILIAL', 'ADMIN', '100', { cnpj: '99999999000199' })).startsWith('CNPJ não encontrado'))
checa('ADMIN habilita a PHARMAESTETICS', post('HABILITAR_FILIAL', 'ADMIN', '100', { cnpj: '11.111.111/0001-11' }).data.jaHabilitada === false)

console.log('3) Catálogo (Excel do BI)')
conversoes['bi.xlsx'] = { Plan1: [['Relatório de produtos'], ['Código EAN', 'Descrição do Produto', 'Estoque'], [7891234567895, 'SÉRUM FACIAL 30ML', 10],
  ['7891234567802.0', 'CREME NOTURNO 50G', 5], ['123', 'EAN CURTO', 1], ['7891234567819', '', 2], ['', '', '']] }
const imp = post('IMPORTAR_PRODUTOS', 'SUPERVISOR', '200', { nomeArquivo: 'bi.xlsx', conteudoBase64: Buffer.from('x').toString('base64') })
checa('importa 2 válidos e ignora 2', imp.ok && imp.data.novos === 2 && imp.data.ignorados === 2, JSON.stringify(imp))
checa('OPERACIONAL não importa', erro(post('IMPORTAR_PRODUTOS', 'OPERACIONAL', '300', { nomeArquivo: 'bi.xlsx', conteudoBase64: 'eA==' })) === 'Somente SUPERVISOR e ADMIN importam o catálogo.')
conversoes['cols.xlsx'] = { P: [['Código', 'Nome', 'Qtd'], ['1', 'x', '2']] }
checa('colunas não encontradas: lista as do arquivo', erro(post('IMPORTAR_PRODUTOS', 'ADMIN', '100', { nomeArquivo: 'cols.xlsx', conteudoBase64: 'eA==' })).includes('Código, Nome, Qtd'))
conversoes['bi2.xlsx'] = { P: [['EAN', 'Descricao'], ['7891234567895', 'SÉRUM FACIAL 30ML NOVO']] }
checa('reimportar atualiza a descrição', post('IMPORTAR_PRODUTOS', 'ADMIN', '100', { nomeArquivo: 'bi2.xlsx', conteudoBase64: 'eA==' }).data.atualizados === 1)

console.log('3b) Relatório de ocupação do WMS/BI (formato real de 17/11/2026)')
conversoes['ocupacao-b2c.xlsx'] = { Export: [
  ['Classe', 'Descrição Classe', 'Produto Codigo', 'Produto', 'Lote', 'Dt Venc', 'Qtd Uc', 'Qtd Un', 'Valor Total', 'Vlr Méd Un', 'Qtd End', 'Endereço', 'Grupo', 'Subgrupo'],
  ['00', 'PRODUTO DISPONÍVEL', '2000000000008', 'SACO ZIPLOCK 7 X 10', '0001935', '', 1438, 1438, 14.38, 0.01, 1, 'G2B1118121', 'LIBERADOS', 'ÁREA REFRIGERADA'],
  ['00', 'PRODUTO DISPONÍVEL', '7898976264006', 'BIOGELIS VOLUME WITH LIDOCAINE 25 MG/ML+0,3% LIDOCAINA', '2606VL054A1E', '', 5, 5, 416.75, 83.35, 1, 'G2B1017122', 'LIBERADOS', 'ÁREA REFRIGERADA'],
  ['00', 'PRODUTO DISPONÍVEL', '7898976264006', 'BIOGELIS VOLUME WITH LIDOCAINE 25 MG/ML+0,3% LIDOCAINA', '2606VL055A2E', '', 39, 39, 3250.65, 83.35, 1, 'G2B1017131', 'LIBERADOS', 'ÁREA REFRIGERADA'],
  [], ['Filtros aplicados:\nDESCRICAORESUMIDA é PHARMAES B2C\nNOMERESUMIDO é G2 - ES - JACARAIPE']] }
const oc = post('IMPORTAR_PRODUTOS', 'ADMIN', '100', { nomeArquivo: 'ocupacao-b2c.xlsx', conteudoBase64: 'eA==' })
checa('"Produto Codigo" reconhecido como EAN: 2 produtos novos (repetições de lote juntadas)', oc.ok && oc.data.novos === 2, JSON.stringify(oc))
const cat = post('CONFIG', 'ADMIN', '100').data.produtos
checa('descrição veio de "Produto", nunca de "Descrição Classe"', cat.find(x => x.ean === '7898976264006')?.descricao === 'BIOGELIS VOLUME WITH LIDOCAINE 25 MG/ML+0,3% LIDOCAINA'
  && !cat.some(x => x.descricao === 'PRODUTO DISPONÍVEL'))
checa('rodapé "Filtros aplicados" ignorado', oc.data.ignorados === 0)
console.log('4) Lançamento por NF (vários EANs)')
const lote = (extra) => post('CRIAR_LOTE', 'OPERACIONAL', '300', { requestId: 'r1', cnpj: PE, canal: 'b2c', notaFiscal: 'TESTE-1001', data: '2026-11-17',
  itens: [{ ean: '7891234567895', qtdPecas: 100, qtdDun14: 10, qtdEanCartucho: 100, qtdPallets: 1 }, { ean: '7891234567802', qtdPecas: 40, qtdDun14: 4 }], ...extra })
const l1 = lote()
checa('NF com 2 EANs gravada', l1.ok && l1.data.lancamentos === 2, JSON.stringify(l1))
const pe = real.p.abas.PE_LANCAMENTOS.v, h = pe[0]
const linha = (ean) => Object.fromEntries(h.map((c, i) => [c, pe.find(l => l[h.indexOf('EAN')] === ean)[i]]))
checa('valores: 10×0,80 + 100×0,60 + 1×12,00 = 80,00', linha('7891234567895').VALOR_TOTAL === 80)
checa('descrição veio do catálogo', linha('7891234567802').DESCRICAO === 'CREME NOTURNO 50G')
checa('canal gravado em maiúsculas (B2C)', linha('7891234567802').CANAL === 'B2C')
checa('reenvio não duplica', lote().data.repetido === true && pe.length === 3)
const recusa = (nome, extra, msg) => checa(nome, erro(lote({ requestId: 'r-' + randomUUID(), ...extra })).includes(msg), erro(lote({ requestId: 'z' + randomUUID(), ...extra })))
recusa('EAN fora do catálogo', { itens: [{ ean: '7890000000000', qtdPecas: 1, qtdDun14: 1 }] }, 'não está no catálogo')
recusa('EAN repetido na nota', { itens: [{ ean: '7891234567895', qtdPecas: 1, qtdDun14: 1 }, { ean: '7891234567895', qtdPecas: 1, qtdDun14: 1 }] }, 'repetido nesta nota')
recusa('EAN no cartucho maior que peças', { itens: [{ ean: '7891234567895', qtdPecas: 5, qtdEanCartucho: 6 }] }, 'não pode ser maior')
recusa('sem nenhum serviço', { itens: [{ ean: '7891234567895', qtdPecas: 5 }] }, 'Informe ao menos um serviço')
recusa('sem B2B/B2C', { canal: '' }, 'Marque B2B ou B2C')
recusa('filial da Acess não habilitada', { cnpj: ACESS }, 'não está habilitada')
checa('CLIENTE não lança', erro(post('CRIAR_LOTE', 'CLIENTE', '400', { requestId: 'c1', cnpj: PE, canal: 'B2B', notaFiscal: 'X', data: '2026-11-17', itens: [] })) === 'Perfil CLIENTE é somente leitura.')
const lotesAntes = pe.length
checa('nota com uma linha inválida não grava nada', !lote({ requestId: 'r-bad', itens: [{ ean: '7891234567895', qtdPecas: 1, qtdDun14: 1 }, { ean: '0', qtdPecas: 1 }] }).ok && pe.length === lotesAntes)

console.log('5) Consulta')
const lista = (perfil, mat) => post('LISTAR', perfil, mat, { mes: '2026-11' })
checa('SUPERVISOR vê os 2 lançamentos', lista('SUPERVISOR', '200').data.length === 2)
checa('CLIENTE só da Acess não vê nada', lista('CLIENTE', '400').data.length === 0)
checa('competências', JSON.stringify(post('MESES', 'OPERACIONAL', '300').data) === '["2026-11"]')
const cfg = post('CONFIG', 'OPERACIONAL', '300').data
checa('config: filial, catálogo e tarifa vigente', cfg.filiais.length === 1 && cfg.produtos.length === 4 && cfg.tarifaVigente && cfg.permissoes.lancar && !cfg.permissoes.cancelar)

console.log('6) Edição e cancelamento')
const alvo = lista('SUPERVISOR', '200').data.find(x => x.ean === '7891234567802')
checa('OPERACIONAL altera quantidades (recalcula)', post('EDITAR', 'OPERACIONAL', '300', { id: alvo.id, versao: alvo.versao, qtdPecas: 40, qtdDun14: 5 }).ok
  && lista('SUPERVISOR', '200').data.find(x => x.id === alvo.id).valorTotal === 4)
checa('versão desatualizada recusada', erro(post('EDITAR', 'OPERACIONAL', '300', { id: alvo.id, versao: 1, qtdPecas: 40, qtdDun14: 6 })).includes('alterado por outro usuário'))
checa('OPERACIONAL não troca a nota', erro(post('EDITAR', 'OPERACIONAL', '300', { id: alvo.id, versao: 2, qtdPecas: 40, qtdDun14: 5, notaFiscal: 'OUTRA' })) === 'Seu perfil pode alterar apenas as quantidades do lançamento.')
checa('SUPERVISOR troca o canal', post('EDITAR', 'SUPERVISOR', '200', { id: alvo.id, versao: 2, qtdPecas: 40, qtdDun14: 5, canal: 'B2B' }).ok && lista('SUPERVISOR', '200').data.find(x => x.id === alvo.id).canal === 'B2B')
checa('OPERACIONAL não cancela', erro(post('CANCELAR', 'OPERACIONAL', '300', { id: alvo.id, versao: 3, motivo: 'x' })) === 'Somente SUPERVISOR e ADMIN cancelam uma cobrança.')
checa('SUPERVISOR cancela com motivo', post('CANCELAR', 'SUPERVISOR', '200', { id: alvo.id, versao: 3, motivo: 'Lançado em duplicidade' }).ok)
checa('cancelado não edita', erro(post('EDITAR', 'SUPERVISOR', '200', { id: alvo.id, versao: 4, qtdPecas: 1, qtdDun14: 1 })).includes('cancelada'))

console.log('7) Nova vigência de tarifas')
checa('SUPERVISOR não altera tarifa', erro(post('CRIAR_VIGENCIA', 'SUPERVISOR', '200', { vigenciaInicio: '2026-12-01', dun14: 1, eanCartucho: 1, descargaPallet: 1 })) === 'Somente ADMIN altera as tarifas.')
checa('ADMIN cria vigência de 01/12', post('CRIAR_VIGENCIA', 'ADMIN', '100', { vigenciaInicio: '2026-12-01', dun14: '0,90', eanCartucho: 0.7, descargaPallet: 13 }).ok)
checa('vigência anterior encerrada em 30/11', real.p.abas.PE_PRECOS.v[1][2] === '2026-11-30')
post('CRIAR_LOTE', 'OPERACIONAL', '300', { requestId: 'r-dez', cnpj: PE, canal: 'B2B', notaFiscal: 'TESTE-2002', data: '2026-12-02', itens: [{ ean: '7891234567895', qtdPecas: 1, qtdDun14: 10 }] })
checa('lançamento de dezembro usa a tarifa nova (10×0,90 = 9,00)', post('LISTAR', 'ADMIN', '100', { mes: '2026-12' }).data[0].valorTotal === 9)

console.log('8) Isolamento e limpeza')
checa('abas existentes (filiais, vínculos, auditoria e retrabalhos da Acess) intactas', JSON.stringify(['CLIENTES_FILIAIS', 'USUARIO_FILIAIS', 'AUDITORIA', 'RETRABALHOS'].map(n => real.p.abas[n].v)) === fotoAntes)
checa('auditoria própria registrada (PE_AUDITORIA)', real.p.abas.PE_AUDITORIA.v.length > 8)
ctx.limparTestesPharmaEstetics()
checa('limpeza desativa os lançamentos TESTE-', post('LISTAR', 'ADMIN', '100', { mes: '2026-11' }).data.length === 0)

console.log(`\nRESULTADO: ${ok} OK, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
