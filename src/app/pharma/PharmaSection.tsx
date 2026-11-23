'use client'

// Fluxo PHARMAESTETICS (17/11/2026), integrado às seções do app (23/11/2026): a lista e o "Novo lançamento" ficam em
// Lançamentos (seletor "Cliente"), o catálogo em Processos e as tarifas em Preços. Usa as mesmas classes visuais
// (metrics, panel, mobile-record-table, error, success-note) e fala só com /api/pharma.
import { useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Calendar } from 'primereact/calendar'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { Tag } from 'primereact/tag'
import './pharma.css'

type Filial = { cnpj: string; nomeCliente: string; filial: string }
type Produto = { ean: string; descricao: string }
type Tarifa = { id: string; inicio: string; fim: string; dun14: number; eanCartucho: number; descargaPallet: number; observacao?: string }
type Config = {
  filiais: Filial[]; produtos: Produto[]; tarifas: Tarifa[]
  tarifaVigente: { id: string; dun14: number; eanCartucho: number; descargaPallet: number } | null
  importacoes: { arquivo: string; novos: number; atualizados: number; ignorados: number; em: string }[]
  permissoes: { lancar: boolean; cancelar: boolean; importar: boolean; tarifas: boolean }
}
type Lancamento = {
  id: string; data: string; competencia: string; cnpj: string; filial: string; canal: 'B2B' | 'B2C'; notaFiscal: string; ean: string
  descricao: string; qtdPecas: number; qtdDun14: number; qtdEanCartucho: number; qtdPallets: number; tarifaDun14: number
  tarifaEanCartucho: number; tarifaDescargaPallet: number; valorDun14: number; valorEanCartucho: number; valorDescarga: number
  valorTotal: number; cobrancaCancelada: boolean; motivoCancelamento: string; versao: number; criadoPor: string
}
type Item = { chave: string; ean: string; qtdPecas: number | null; qtdDun14: number | null; qtdEanCartucho: number | null; qtdPallets: number | null }
export type PharmaConfig = Config

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const tarifa = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 })
const int = (v: number) => (Number(v) || 0).toLocaleString('pt-BR')
const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
const itemVazio = (): Item => ({ chave: novoId(), ean: '', qtdPecas: null, qtdDun14: null, qtdEanCartucho: null, qtdPallets: null })
const cell = (label: string, role?: 'title' | 'actions' | 'wide') => ({
  bodyCell: { 'data-label': label, className: role === 'title' ? 'card-title' : role === 'actions' ? 'card-actions' : role === 'wide' ? 'card-wide' : undefined } as unknown as React.HTMLAttributes<HTMLTableCellElement>,
})
const mesLabel = (m: string) => { const [a, mm] = m.split('-'); return new Date(Number(a), Number(mm) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.ok === false) throw new Error(data?.error?.message || 'Falha na operação.')
  return data
}
const gravar = (acao: string, dados: Record<string, unknown>) => api('/api/pharma', { method: 'POST', body: JSON.stringify({ acao, ...dados }) })

function csv(nome: string, cabecalho: string[], linhas: unknown[][]) {
  const c = (v: unknown) => { const t = String(v ?? ''); return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const blob = new Blob(['\uFEFF' + [cabecalho, ...linhas].map(l => l.map(c).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove()
}

/** Carrega a configuração do fluxo (filiais habilitadas no escopo do usuário, catálogo, tarifas e permissões). */
export async function carregarPharmaConfig(): Promise<Config | null> {
  try { const r = await api('/api/pharma?acao=CONFIG'); return r.data as Config } catch { return null }
}

/** Lançamentos PHARMAESTETICS da filial escolhida no seletor "Cliente" da seção Lançamentos. */
export function PharmaLancamentos({ config, cnpj, recarga, exportarRef, onContagem }: {
  config: Config; cnpj: string; recarga: number
  // O botão "Exportar" do topo da página (o mesmo da Acess) chama esta exportação; a contagem habilita o botão.
  exportarRef: { current: (() => void) | null }; onContagem: (n: number) => void
}) {
  const [meses, setMeses] = useState<string[]>([])
  const [mes, setMes] = useState(hoje().slice(0, 7))
  const [lista, setLista] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [fCanal, setFCanal] = useState<'TODOS' | 'B2B' | 'B2C'>('TODOS')
  const [fSituacao, setFSituacao] = useState<'ATIVOS' | 'CANCELADOS' | 'TODOS'>('ATIVOS')
  const [fTexto, setFTexto] = useState('')
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [cancelando, setCancelando] = useState<Lancamento | null>(null)
  const p = config.permissoes
  const perfilPodeTudo = p.cancelar

  async function carregarLista(alvo = mes) {
    setCarregando(true)
    try { const r = await api(`/api/pharma?acao=LISTAR&mes=${alvo}`); setLista(r.data || []); setErro('') } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  useEffect(() => { api('/api/pharma?acao=MESES').then(r => setMeses(r.data || [])).catch(() => setMeses([])) }, [recarga])
  useEffect(() => { void carregarLista(mes) }, [mes, recarga])
  useEffect(() => { if (!sucesso) return; const t = window.setTimeout(() => setSucesso(''), 5000); return () => window.clearTimeout(t) }, [sucesso])

  const visiveis = useMemo(() => {
    const q = fTexto.trim().toUpperCase()
    return lista.filter(l => l.cnpj === cnpj && (fCanal === 'TODOS' || l.canal === fCanal)
      && (fSituacao === 'TODOS' || (fSituacao === 'CANCELADOS' ? l.cobrancaCancelada : !l.cobrancaCancelada))
      && (!q || l.notaFiscal.toUpperCase().includes(q) || l.ean.includes(q) || l.descricao.toUpperCase().includes(q)))
  }, [lista, cnpj, fCanal, fSituacao, fTexto])
  const ativos = visiveis.filter(l => !l.cobrancaCancelada)
  const totais = {
    notas: new Set(ativos.map(l => l.notaFiscal)).size, pecas: ativos.reduce((a, l) => a + l.qtdPecas, 0),
    etiquetas: ativos.reduce((a, l) => a + l.qtdDun14, 0), valor: ativos.reduce((a, l) => a + l.valorTotal, 0),
  }
  const mesesOpcoes = Array.from(new Set([mes, hoje().slice(0, 7), ...meses])).sort().reverse().map(m => ({ label: mesLabel(m), value: m }))
  useEffect(() => { onContagem(visiveis.length) }, [visiveis.length])
  useEffect(() => { exportarRef.current = exportar; return () => { exportarRef.current = null } })

  function exportar() {
    csv(`pharmaestetics-${mes}.csv`,
      ['Data', 'Competência', 'Filial', 'Canal', 'Nota fiscal', 'EAN', 'Descrição', 'Peças', 'Etiquetas DUN-14', 'EAN no cartucho', 'Pallets',
        'Tarifa DUN-14', 'Tarifa EAN cartucho', 'Tarifa descarga/pallet', 'Valor DUN-14', 'Valor EAN cartucho', 'Valor descarga', 'Valor total',
        'Cobrança cancelada', 'Motivo do cancelamento', 'Lançado por'],
      visiveis.map(l => [dataBr(l.data), l.competencia, l.filial, l.canal, l.notaFiscal, l.ean, l.descricao, l.qtdPecas, l.qtdDun14, l.qtdEanCartucho,
        l.qtdPallets, l.tarifaDun14, l.tarifaEanCartucho, l.tarifaDescargaPallet, l.valorDun14, l.valorEanCartucho, l.valorDescarga, l.valorTotal,
        l.cobrancaCancelada ? 'SIM' : 'NAO', l.motivoCancelamento, l.criadoPor].map(v => (typeof v === 'number' ? String(v).replace('.', ',') : v))))
  }

  return (
    <>
      {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
      {sucesso && <div className="success-note"><i className="pi pi-check-circle" />{sucesso}</div>}
      <div className="metrics metrics-4">
        <article><i className="pi pi-file" /><div><span>Notas fiscais</span><strong>{int(totais.notas)}</strong></div></article>
        <article><i className="pi pi-box" /><div><span>Peças</span><strong>{int(totais.pecas)}</strong></div></article>
        <article><i className="pi pi-tags" /><div><span>Etiquetas DUN-14</span><strong>{int(totais.etiquetas)}</strong></div></article>
        <article><i className="pi pi-wallet" /><div><span>Valor (sem cancelados)</span><strong>{brl(totais.valor)}</strong></div></article>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div><small className="panel-eyebrow">REGISTROS</small><h2>Histórico por nota fiscal</h2><p>Por NF e EAN. B2B e B2C só classificam; a tarifa é a mesma.</p></div>
          <div className="labor-head-actions">
            <Dropdown aria-label="Situação da cobrança" value={fSituacao} options={[{ label: 'Ativos', value: 'ATIVOS' }, { label: 'Cancelados', value: 'CANCELADOS' }, { label: 'Todos', value: 'TODOS' }]} optionLabel="label" optionValue="value" onChange={e => setFSituacao(e.value)} />
            <Dropdown aria-label="Mês" value={mes} options={mesesOpcoes} optionLabel="label" optionValue="value" onChange={e => setMes(String(e.value))} />
            <Button icon="pi pi-refresh" text rounded aria-label="Atualizar" onClick={() => void carregarLista()} loading={carregando} />
          </div>
        </div>
        <div className="history-filters">
          <Dropdown aria-label="Canal" value={fCanal} options={[{ label: 'B2B e B2C', value: 'TODOS' }, { label: 'Só B2B', value: 'B2B' }, { label: 'Só B2C', value: 'B2C' }]} optionLabel="label" optionValue="value" onChange={e => setFCanal(e.value)} />
          <span className="history-ean pharma-busca">
            <i className="pi pi-search" aria-hidden="true" />
            <InputText value={fTexto} onChange={e => setFTexto(e.target.value)} placeholder="NF, EAN ou descrição" aria-label="Buscar por NF, EAN ou descrição" />
            {fTexto && <button type="button" className="history-ean-clear" aria-label="Limpar busca" onClick={() => setFTexto('')}><i className="pi pi-times" /></button>}
          </span>
        </div>
        <DataTable className="mobile-record-table" value={visiveis} loading={carregando} paginator rows={20} dataKey="id" stripedRows scrollable emptyMessage="Nenhum lançamento PHARMAESTETICS no período.">
          <Column pt={cell('Nota fiscal', 'title')} header="NF" body={(l: Lancamento) => <strong>{l.notaFiscal}</strong>} />
          <Column pt={cell('Data')} header="Data" body={(l: Lancamento) => dataBr(l.data)} />
          <Column pt={cell('Canal')} header="Canal" body={(l: Lancamento) => <Tag value={l.canal} severity={l.canal === 'B2B' ? 'info' : 'warning'} />} />
          <Column pt={cell('Produto', 'wide')} header="EAN / descrição" body={(l: Lancamento) => <div className="pharma-produto"><strong>{l.ean}</strong><small>{l.descricao}</small></div>} />
          <Column pt={cell('Peças')} header="Peças" body={(l: Lancamento) => int(l.qtdPecas)} />
          <Column pt={cell('DUN-14')} header="DUN-14" body={(l: Lancamento) => int(l.qtdDun14)} />
          <Column pt={cell('EAN cartucho')} header="EAN cart." body={(l: Lancamento) => int(l.qtdEanCartucho)} />
          <Column pt={cell('Pallets')} header="Pallets" body={(l: Lancamento) => int(l.qtdPallets)} />
          <Column pt={cell('Valor')} header="Valor" body={(l: Lancamento) => <span className={l.cobrancaCancelada ? 'pharma-cancelado' : ''}>{brl(l.valorTotal)}</span>} />
          <Column pt={cell('Situação')} header="Situação" body={(l: Lancamento) => l.cobrancaCancelada ? <Tag value="Cancelada" severity="danger" title={l.motivoCancelamento} /> : <Tag value="Ativa" severity="success" />} />
          {p.lancar && <Column pt={cell('Ações', 'actions')} header="" body={(l: Lancamento) => !l.cobrancaCancelada && <div className="pharma-acoes">
            <Button icon="pi pi-pencil" text rounded aria-label={`Editar ${l.ean}`} onClick={() => setEditando(l)} />
            {p.cancelar && <Button icon="pi pi-ban" text rounded severity="danger" aria-label={`Cancelar ${l.ean}`} onClick={() => setCancelando(l)} />}
          </div>} />}
        </DataTable>
      </section>
      {editando && <Edicao l={editando} podeTudo={perfilPodeTudo} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); setSucesso('Lançamento atualizado.'); void carregarLista() }} />}
      {cancelando && <Cancelamento l={cancelando} onFechar={() => setCancelando(null)} onSalvo={() => { setCancelando(null); setSucesso('Cobrança cancelada.'); void carregarLista() }} />}
    </>
  )
}

function Quantidades({ v, muda }: { v: Partial<Item>; muda: (c: keyof Item, n: number | null) => void }) {
  return (
    <div className="pharma-qtds">
      <label><span>Peças *</span><InputNumber value={v.qtdPecas ?? null} min={0} useGrouping={false} onValueChange={e => muda('qtdPecas', e.value ?? null)} /></label>
      <label><span>Etiquetas DUN-14</span><InputNumber value={v.qtdDun14 ?? null} min={0} useGrouping={false} onValueChange={e => muda('qtdDun14', e.value ?? null)} /></label>
      <label><span>EAN no cartucho</span><InputNumber value={v.qtdEanCartucho ?? null} min={0} useGrouping={false} onValueChange={e => muda('qtdEanCartucho', e.value ?? null)} /></label>
      <label><span>Pallets (descarga)</span><InputNumber value={v.qtdPallets ?? null} min={0} useGrouping={false} onValueChange={e => muda('qtdPallets', e.value ?? null)} /></label>
    </div>
  )
}

/** "Novo lançamento" de PHARMAESTETICS: janela, como o novo lançamento da Acess. */
export function PharmaNovaNota({ config, cnpjInicial, visivel, onFechar, onSalvo }: { config: Config; cnpjInicial: string; visivel: boolean; onFechar: () => void; onSalvo: (m: string, data: string) => void }) {
  const [requestId, setRequestId] = useState(novoId)
  const [cnpj, setCnpj] = useState(cnpjInicial || (config.filiais.length === 1 ? config.filiais[0].cnpj : ''))
  const [data, setData] = useState(hoje())
  const [canal, setCanal] = useState<'' | 'B2B' | 'B2C'>('')
  const [nf, setNf] = useState('')
  const [itens, setItens] = useState<Item[]>([itemVazio()])
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const produtos = useMemo(() => config.produtos.map(x => ({ label: `${x.ean} — ${x.descricao}`, value: x.ean })), [config.produtos])
  const t = config.tarifaVigente
  const previa = t ? itens.reduce((a, i) => a + (i.qtdDun14 || 0) * t.dun14 + (i.qtdEanCartucho || 0) * t.eanCartucho + (i.qtdPallets || 0) * t.descargaPallet, 0) : 0
  const muda = (chave: string, c: keyof Item, v: unknown) => setItens(l => l.map(i => (i.chave === chave ? { ...i, [c]: v } : i)))

  async function salvar() {
    setErro('')
    if (!cnpj) return setErro('Selecione a filial.')
    if (!canal) return setErro('Marque B2B ou B2C.')
    if (!nf.trim()) return setErro('Informe a nota fiscal.')
    setSalvando(true)
    try {
      const r = await gravar('CRIAR_LOTE', { requestId, cnpj, data, canal, notaFiscal: nf.trim(), itens: itens.map(({ chave, ...i }) => i) })
      onSalvo(r.data?.repetido ? `NF ${nf} já estava lançada (nada foi duplicado).` : `NF ${nf} lançada com ${r.data?.lancamentos ?? itens.length} EAN(s).`, data)
      setRequestId(novoId()); setNf(''); setItens([itemVazio()]); setCanal('')
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const aviso = !config.produtos.length ? 'O catálogo de EANs está vazio. Importe o Excel do BI em Processos → Catálogo PHARMAESTETICS antes de lançar.'
    : !t ? 'Não há tarifa PHARMAESTETICS vigente para hoje. Peça ao ADMIN para cadastrar em Preços → Tarifas PHARMAESTETICS.' : ''
  return (
    <Dialog header="Novo lançamento — PHARMAESTETICS" visible={visivel} onHide={() => !salvando && onFechar()} style={{ width: 'min(980px, 96vw)' }} modal
      footer={aviso ? <Button label="Fechar" text onClick={onFechar} /> : <div className="pharma-rodape">
        <Button type="button" icon="pi pi-plus" label="Adicionar EAN" outlined onClick={() => setItens(l => [...l, itemVazio()])} disabled={itens.length >= 100 || salvando} />
        <span className="pharma-previa">Prévia: <strong>{brl(previa)}</strong> <small>(DUN-14 {brl(t!.dun14)} · EAN {brl(t!.eanCartucho)} · pallet {brl(t!.descargaPallet)})</small></span>
        <span className="pharma-rodape-botoes"><Button label="Cancelar" text onClick={onFechar} disabled={salvando} />
          <Button type="button" icon={salvando ? 'pi pi-spin pi-spinner' : 'pi pi-check'} label={salvando ? 'Salvando…' : 'Lançar NF'} disabled={salvando} onClick={() => void salvar()} /></span>
      </div>}>
      {aviso ? <div className="error"><i className="pi pi-info-circle" />{aviso}</div> : <>
        <p className="pharma-dica">Uma NF com um ou vários EANs. Se alguma linha tiver erro, nada é gravado.</p>
        <div className="pharma-form">
          {config.filiais.length > 1 && <label><span>Filial *</span><Dropdown value={cnpj} options={config.filiais.map(f => ({ label: `${f.nomeCliente} · ${f.filial}`, value: f.cnpj }))} optionLabel="label" optionValue="value" placeholder="Selecione" onChange={e => setCnpj(e.value)} /></label>}
          <label><span>Data *</span><InputText type="date" value={data} onChange={e => setData(e.target.value)} /></label>
          <label><span>Nota fiscal *</span><InputText value={nf} maxLength={30} placeholder="Ex.: 123456" onChange={e => setNf(e.target.value)} /></label>
          <div className="pharma-canal"><span>Canal *</span><div>
            {(['B2B', 'B2C'] as const).map(c => <Button key={c} type="button" label={c} outlined={canal !== c} onClick={() => setCanal(c)} aria-pressed={canal === c} />)}
          </div></div>
        </div>
        {itens.map((i, n) => (
          <fieldset key={i.chave} className="pharma-item">
            <legend>EAN {n + 1}</legend>
            <label className="pharma-ean"><span>EAN *</span><Dropdown value={i.ean} options={produtos} optionLabel="label" optionValue="value" filter filterBy="label" placeholder="Buscar por EAN ou descrição" virtualScrollerOptions={{ itemSize: 38 }} onChange={e => muda(i.chave, 'ean', e.value)} /></label>
            <Quantidades v={i} muda={(c, v) => muda(i.chave, c, v)} />
            {itens.length > 1 && <Button type="button" icon="pi pi-trash" text severity="danger" label="Remover" onClick={() => setItens(l => l.filter(x => x.chave !== i.chave))} />}
          </fieldset>
        ))}
        {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
      </>}
    </Dialog>
  )
}

/** Painel da seção Processos: catálogo de EANs PHARMAESTETICS (importação do Excel do BI).
 *  Mesma marcação de "Planilhas enviadas" da Acess (process-upload em dois passos, tabela dentro do painel). */
export function PharmaCatalogo({ config, onAlterado }: { config: Config; onAlterado: () => void }) {
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  useEffect(() => { if (!sucesso) return; const t = window.setTimeout(() => setSucesso(''), 5000); return () => window.clearTimeout(t) }, [sucesso])
  const [busca, setBusca] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [chave, setChave] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const q = busca.trim().toUpperCase()
  const lista = q ? config.produtos.filter(x => x.ean.includes(q) || x.descricao.toUpperCase().includes(q)) : config.produtos
  const ultima = config.importacoes[0]
  async function importar() {
    if (!arquivo) return setErro('Escolha o arquivo Excel exportado do BI.')
    setEnviando(true); setErro('')
    try {
      const b64 = await new Promise<string>((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); r.readAsDataURL(arquivo) })
      const d = (await gravar('IMPORTAR_PRODUTOS', { nomeArquivo: arquivo.name, conteudoBase64: b64 })).data
      setSucesso(`Catálogo importado de ${d.arquivo}: ${d.novos} novo(s), ${d.atualizados} atualizado(s), ${d.ignorados} linha(s) ignorada(s).`)
      setArquivo(null); setChave(k => k + 1); onAlterado()
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }
  return (
    <section className="panel workspace-page pharma-painel">
      <div className="panel-head">
        <div>
          <small className="panel-eyebrow">CATÁLOGO · PHARMAESTETICS</small>
          <h2>Catálogo de EANs</h2>
          <p>Relatório de ocupação exportado do BI (colunas “Produto Codigo” e “Produto”). Importe o B2B e o B2C: o catálogo é um só.</p>
        </div>
        <Button icon="pi pi-refresh" text rounded aria-label="Atualizar" onClick={onAlterado} />
      </div>
      <div className="page-body">
        <div className={`process-upload pharma-upload ${config.permissoes.importar ? '' : 'somente-busca'}`}>
          <label>Buscar no catálogo<InputText value={busca} onChange={e => setBusca(e.target.value)} placeholder="EAN ou descrição" /></label>
          {config.permissoes.importar && <>
            <label>
              Planilha do BI (.xlsx ou .xls) *
              <input key={chave} className="file-input" type="file" accept=".xlsx,.xls" onChange={e => setArquivo(e.target.files?.[0] || null)} />
            </label>
            <Button label="Importar catálogo" icon="pi pi-upload" className="primary" loading={enviando} onClick={() => void importar()} />
          </>}
        </div>
        {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
        {sucesso && <div className="success-note"><i className="pi pi-check-circle" />{sucesso}</div>}
        <p className="pharma-dica pharma-resumo">{config.produtos.length} produto(s) disponíveis para lançamento.{ultima ? ` Última importação: ${ultima.arquivo} (${ultima.novos} novo(s), ${ultima.atualizados} atualizado(s))${ultima.em ? ` em ${new Date(ultima.em).toLocaleString('pt-BR')}` : ''}.` : ''}</p>
        <DataTable className="mobile-record-table process-record-table" value={lista} paginator rows={15} dataKey="ean" stripedRows emptyMessage="Nenhum produto no catálogo.">
          <Column pt={cell('EAN', 'title')} field="ean" header="EAN" />
          <Column pt={cell('Descrição', 'wide')} field="descricao" header="Descrição" />
        </DataTable>
      </div>
    </section>
  )
}

/** Painel da seção Preços: tarifas PHARMAESTETICS e, para o ADMIN, habilitação de filial.
 *  Mesma marcação do painel de preços da Acess (price-create, price-rule, price-record-table). */
export function PharmaTarifas({ config, perfil, onAlterado }: { config: Config; perfil: string; onAlterado: () => void }) {
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  useEffect(() => { if (!sucesso) return; const t = window.setTimeout(() => setSucesso(''), 5000); return () => window.clearTimeout(t) }, [sucesso])
  const [inicio, setInicio] = useState<Date | null>(null)
  const [dun14, setDun14] = useState<number | null>(config.tarifaVigente?.dun14 ?? null)
  const [ean, setEan] = useState<number | null>(config.tarifaVigente?.eanCartucho ?? null)
  const [pallet, setPallet] = useState<number | null>(config.tarifaVigente?.descargaPallet ?? null)
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [todas, setTodas] = useState<{ cnpj: string; nomeCliente: string; filial: string }[]>([])
  const [cnpj, setCnpj] = useState('')
  const admin = perfil === 'ADMIN'
  useEffect(() => { if (admin) api('/api/filiais?all=1').then(r => setTodas(r.data || [])).catch(() => setTodas([])) }, [admin])
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const habilitadas = new Set(config.filiais.map(f => f.cnpj))
  async function criar() {
    if (!inicio) return setErro('Informe o início da nova vigência.')
    setSalvando(true); setErro('')
    try {
      await gravar('CRIAR_VIGENCIA', { vigenciaInicio: iso(inicio), dun14, eanCartucho: ean, descargaPallet: pallet, observacao })
      setSucesso('Nova vigência de tarifas PHARMAESTETICS cadastrada.'); setInicio(null); setObservacao(''); onAlterado()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  async function habilitar() {
    setSalvando(true); setErro('')
    try {
      const r = await gravar('HABILITAR_FILIAL', { cnpj })
      setSucesso(r.data?.jaHabilitada ? 'Esta filial já estava habilitada.' : 'Filial habilitada para o lançamento por NF.'); setCnpj(''); onAlterado()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const moeda = { mode: 'currency' as const, currency: 'BRL', locale: 'pt-BR', min: 0, minFractionDigits: 4, maxFractionDigits: 4 }
  return (
    <section className="panel workspace-page pharma-painel">
      <div className="panel-head">
        <div>
          <small className="panel-eyebrow">VIGÊNCIAS · PHARMAESTETICS</small>
          <h2>Tarifas PHARMAESTETICS</h2>
          <p>Lançamento por nota fiscal e EAN. Cada lançamento usa a vigência da sua data.</p>
        </div>
        <Button icon="pi pi-refresh" text rounded aria-label="Atualizar" onClick={onAlterado} />
      </div>
      <div className="page-body">
        {admin && (
          <div className="price-create">
            <label>Nova vigência<Calendar value={inicio} onChange={e => setInicio((e.value as Date) || null)} dateFormat="dd/mm/yy" placeholder="dd/mm/aaaa" /></label>
            <label>Etiqueta DUN-14 (por etiqueta)<InputNumber value={dun14} onValueChange={e => setDun14(e.value ?? null)} {...moeda} /></label>
            <label>EAN no cartucho (por unidade)<InputNumber value={ean} onValueChange={e => setEan(e.value ?? null)} {...moeda} /></label>
            <label>Descarga paletizada (por pallet)<InputNumber value={pallet} onValueChange={e => setPallet(e.value ?? null)} {...moeda} /></label>
            <label className="price-observation">Observação<InputText value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Motivo ou referência da alteração" /></label>
            <Button label="Criar vigência" icon="pi pi-plus" className="primary" loading={salvando} disabled={dun14 == null || ean == null || pallet == null} onClick={() => void criar()} />
          </div>
        )}
        {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
        {sucesso && <div className="success-note"><i className="pi pi-check-circle" />{sucesso}</div>}
        <div className="price-rule">
          <strong>Regra de cobrança:</strong> <strong>etiqueta DUN-14</strong> por etiqueta aplicada, <strong>EAN no cartucho</strong> por unidade (peça)
          e <strong>descarga paletizada</strong> por pallet recebido; os serviços se somam. <strong>B2B</strong> e <strong>B2C</strong> usam a mesma tarifa (só classificam o lançamento).
        </div>
        <DataTable className="mobile-record-table price-record-table" value={[...config.tarifas].reverse()} paginator={config.tarifas.length > 10} rows={10} dataKey="id" emptyMessage="Nenhuma vigência cadastrada.">
          <Column pt={cell('Início', 'title')} header="Início" body={(x: Tarifa) => dataBr(x.inicio)} />
          <Column pt={cell('Fim')} header="Fim" body={(x: Tarifa) => (x.fim ? dataBr(x.fim) : 'Vigente')} />
          <Column pt={cell('DUN-14')} header="DUN-14 / etiqueta" body={(x: Tarifa) => tarifa(x.dun14)} />
          <Column pt={cell('EAN no cartucho')} header="EAN no cartucho / un." body={(x: Tarifa) => tarifa(x.eanCartucho)} />
          <Column pt={cell('Descarga')} header="Descarga / pallet" body={(x: Tarifa) => tarifa(x.descargaPallet)} />
          <Column pt={cell('Observação', 'wide')} header="Observação" body={(x: Tarifa) => x.observacao || '—'} />
        </DataTable>
        {admin && (
          <div className="price-create pharma-filiais">
            <label>Habilitar filial para lançamento por NF
              <Dropdown value={cnpj} options={todas.map(f => ({ label: `${f.nomeCliente} · ${f.filial}${habilitadas.has(f.cnpj) ? ' (habilitada)' : ''}`, value: f.cnpj }))}
                optionLabel="label" optionValue="value" filter placeholder="Selecione a filial" onChange={e => setCnpj(e.value)} />
            </label>
            <Button label="Habilitar" icon="pi pi-check" className="primary" loading={salvando} disabled={!cnpj} onClick={() => void habilitar()} />
            <p className="pharma-dica">Habilitadas: {config.filiais.map(f => `${f.nomeCliente} · ${f.filial}`).join(', ') || 'nenhuma'}.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function Edicao({ l, podeTudo, onFechar, onSalvo }: { l: Lancamento; podeTudo: boolean; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState<Partial<Item>>({ qtdPecas: l.qtdPecas, qtdDun14: l.qtdDun14, qtdEanCartucho: l.qtdEanCartucho, qtdPallets: l.qtdPallets })
  const [data, setData] = useState(l.data)
  const [canal, setCanal] = useState(l.canal)
  const [nf, setNf] = useState(l.notaFiscal)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const tudo = podeTudo
  async function salvar() {
    setSalvando(true); setErro('')
    try { await gravar('EDITAR', { id: l.id, versao: l.versao, ...v, ...(tudo ? { data, canal, notaFiscal: nf } : {}) }); onSalvo() }
    catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  return (
    <Dialog header={`Editar ${l.ean}`} visible onHide={onFechar} style={{ width: 'min(620px, 96vw)' }} modal
      footer={<><Button label="Cancelar" text onClick={onFechar} disabled={salvando} /><Button label={salvando ? 'Salvando…' : 'Salvar'} icon="pi pi-check" onClick={() => void salvar()} disabled={salvando} /></>}>
      <p className="pharma-produto"><strong>{l.ean}</strong><small>{l.descricao}</small></p>
      {tudo ? <div className="pharma-form">
        <label><span>Data</span><InputText type="date" value={data} onChange={e => setData(e.target.value)} /></label>
        <label><span>Nota fiscal</span><InputText value={nf} maxLength={30} onChange={e => setNf(e.target.value)} /></label>
        <div className="pharma-canal"><span>Canal</span><div>{(['B2B', 'B2C'] as const).map(c => <Button key={c} type="button" label={c} outlined={canal !== c} onClick={() => setCanal(c)} />)}</div></div>
      </div> : <p className="pharma-dica">Seu perfil altera apenas as quantidades.</p>}
      <Quantidades v={v} muda={(c, n) => setV(x => ({ ...x, [c]: n }))} />
      {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
    </Dialog>
  )
}

function Cancelamento({ l, onFechar, onSalvo }: { l: Lancamento; onFechar: () => void; onSalvo: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function confirmar() {
    setSalvando(true); setErro('')
    try { await gravar('CANCELAR', { id: l.id, versao: l.versao, motivo }); onSalvo() } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  return (
    <Dialog header="Cancelar cobrança" visible onHide={onFechar} style={{ width: 'min(520px, 96vw)' }} modal
      footer={<><Button label="Voltar" text onClick={onFechar} disabled={salvando} /><Button label={salvando ? 'Cancelando…' : 'Cancelar cobrança'} severity="danger" onClick={() => void confirmar()} disabled={salvando || !motivo.trim()} /></>}>
      <p>NF <strong>{l.notaFiscal}</strong> · EAN <strong>{l.ean}</strong> ({brl(l.valorTotal)}) deixa de ser cobrado. O histórico fica na auditoria.</p>
      <label className="pharma-motivo"><span>Motivo *</span><InputText value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
      {erro && <div className="error"><i className="pi pi-exclamation-circle" />{erro}</div>}
    </Dialog>
  )
}
