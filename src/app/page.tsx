'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { Password } from 'primereact/password'
import { Tag } from 'primereact/tag'

type Profile = 'OPERACIONAL' | 'SUPERVISOR' | 'ADMIN' | 'CLIENTE'

type User = {
  matricula: string
  nome: string
  perfil: Profile
  trocaSenhaObrigatoria?: boolean
}

type Rework = {
  id: string
  requestId?: string
  dataEfetivacao: string
  sku: string
  descricao: string
  quantidade: number
  dataValidade: string
  nacionalizacao: number
  rfid: number
  totalEtiquetas: number
  idPreco: string
  precoNacionalizacaoUnit: number
  precoRfidAdicionalUnit: number
  valorNacionalizacao: number
  valorRfidAdicional: number
  valorTotalCobranca: number
  matriculaCriacao: string
  criadoEm: string
  matriculaAtualizacao?: string
  atualizadoEm?: string
  versao: number
}

type ManagedUser = {
  matricula: string
  nome: string
  perfil: Profile
  ativo: 'SIM' | 'NAO'
  trocaSenhaObrigatoria: 'SIM' | 'NAO'
  versao: number
}

type PriceRow = {
  id: string
  vigenciaInicio: string
  vigenciaFim: string
  valorNacionalizacao: number
  valorRfidAdicional: number
  ativo: string
  criadoEm: string
  criadoPor: string
  observacao: string
  versao: number
  requestId?: string
}

type AuditRow = {
  idAuditoria: string
  entidade: string
  idRegistro: string
  acao: string
  matriculaAutor: string
  dataHora: string
  versaoAnterior: string | number
  versaoNova: string | number
  dadosAntes: string
  dadosDepois: string
  origem: string
}

function createForm() {
  return {
    id: '',
    requestId: crypto.randomUUID(),
    dataEfetivacao: new Date(),
    sku: '',
    descricao: '',
    quantidade: 0,
    dataValidade: null as Date | null,
    nacionalizacao: 0,
    rfid: 0,
    versao: 0,
  }
}

function createPriceForm() {
  return {
    requestId: crypto.randomUUID(),
    vigenciaInicio: new Date(),
    valorNacionalizacao: 0.4,
    valorRfidAdicional: 0.2,
    observacao: '',
  }
}

function isoDate(value: Date | null) {
  if (!value) return ''
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fromIso(value: string) {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value
  const [y, m] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(y, m - 1, 1))
}

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function csvCell(value: unknown) {
  let text = String(value == null ? '' : value)
  if (/^[=+\-@]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [
    headers.map(csvCell).join(';'),
    ...rows.map(row => row.map(csvCell).join(';')),
  ].join('\r\n')

  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [authError, setAuthError] = useState('')

  const [items, setItems] = useState<Rework[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState(createForm)
  const [dialog, setDialog] = useState(false)

  const [usersDialog, setUsersDialog] = useState(false)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [newUser, setNewUser] = useState({
    matricula: '',
    nome: '',
    perfil: 'OPERACIONAL' as Profile,
    senhaTemporaria: '',
  })
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)

  const [auditDialog, setAuditDialog] = useState(false)
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [selectedAudit, setSelectedAudit] = useState<AuditRow | null>(null)

  const [pricesDialog, setPricesDialog] = useState(false)
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [priceForm, setPriceForm] = useState(createPriceForm)

  const [passwordDialog, setPasswordDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const isClient = user?.perfil === 'CLIENTE'
  const canCreate = Boolean(user && user.perfil !== 'CLIENTE')
  const canEdit = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN'
  const canAudit = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN' || user?.perfil === 'CLIENTE'
  const canUsers = user?.perfil === 'ADMIN'
  const canManagePrices = user?.perfil === 'ADMIN'
  const canViewPrices = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN' || user?.perfil === 'CLIENTE'
  const canExport = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN' || user?.perfil === 'CLIENTE'

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers || {}),
      },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.ok === false) {
      throw new Error(data?.error?.message || 'Falha na operação.')
    }
    return data
  }

  async function loadPrices() {
    try {
      const data = await api('/api/precos')
      setPrices(data.data || [])
      return data.data || []
    } catch {
      setPrices([])
      return []
    }
  }

  async function loadItems(mes?: string) {
    setLoading(true)
    try {
      const query = mes ? `?mes=${encodeURIComponent(mes)}` : ''
      const data = await api('/api/retrabalhos' + query)
      setItems(data.data || [])
    } finally {
      setLoading(false)
    }
  }

  async function loadClientDashboard() {
    setLoading(true)
    try {
      const result = await api('/api/retrabalhos?months=1')
      const available: string[] = result.data || []
      setMonths(available)
      const chosen = available[0] || currentMonth()
      setSelectedMonth(chosen)
      const data = await api('/api/retrabalhos?mes=' + encodeURIComponent(chosen))
      setItems(data.data || [])
    } finally {
      setLoading(false)
    }
  }

  async function changeMonth(value: string) {
    setSelectedMonth(value)
    await loadItems(value)
  }

  useEffect(() => {
    api('/api/auth/me')
      .then(r => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoadingSession(false))
  }, [])

  useEffect(() => {
    if (!user) return
    if (user.trocaSenhaObrigatoria) return

    void loadPrices()
    if (user.perfil === 'CLIENTE') {
      void loadClientDashboard()
    } else {
      void loadItems()
    }
  }, [user])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ matricula, senha }),
      })
      setUser(data.user)
      setSenha('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Falha no login.')
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => null)
    setUser(null)
    setPasswordDialog(false)
    setItems([])
  }

  function openNew() {
    if (!canCreate) return
    setForm(createForm())
    setDialog(true)
  }

  function openEdit(row: Rework) {
    if (!canEdit) return
    setForm({
      id: row.id,
      requestId: row.requestId || '',
      dataEfetivacao: fromIso(row.dataEfetivacao) || new Date(),
      sku: row.sku,
      descricao: row.descricao,
      quantidade: row.quantidade,
      dataValidade: fromIso(row.dataValidade),
      nacionalizacao: row.nacionalizacao,
      rfid: row.rfid,
      versao: row.versao,
    })
    setDialog(true)
  }

  async function save() {
    if (saving || !canCreate) return
    setSaving(true)
    try {
      const payload = {
        id: form.id || undefined,
        requestId: form.requestId,
        dataEfetivacao: isoDate(form.dataEfetivacao),
        sku: form.sku.trim(),
        descricao: form.descricao.trim(),
        quantidade: form.quantidade,
        dataValidade: isoDate(form.dataValidade),
        nacionalizacao: form.nacionalizacao,
        rfid: form.rfid,
        versao: form.versao,
      }

      await api('/api/retrabalhos', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })

      setDialog(false)
      await loadPrices()
      await loadItems()
    } finally {
      setSaving(false)
    }
  }

  async function openUsers() {
    const data = await api('/api/usuarios')
    setUsers(data.data || [])
    setUsersDialog(true)
  }

  async function reloadUsers() {
    const data = await api('/api/usuarios')
    setUsers(data.data || [])
  }

  async function createUser() {
    if (saving) return
    setSaving(true)
    try {
      await api('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify(newUser),
      })
      await reloadUsers()
      setNewUser({
        matricula: '',
        nome: '',
        perfil: 'OPERACIONAL',
        senhaTemporaria: '',
      })
    } finally {
      setSaving(false)
    }
  }

  async function updateUser() {
    if (!editingUser || saving) return
    setSaving(true)
    try {
      await api('/api/usuarios', {
        method: 'PUT',
        body: JSON.stringify({
          matricula: editingUser.matricula,
          perfil: editingUser.perfil,
          ativo: editingUser.ativo,
          versao: editingUser.versao,
        }),
      })
      setEditingUser(null)
      await reloadUsers()
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    setPasswordError('')
    if (newPassword.length < 8) {
      return setPasswordError('A senha deve possuir pelo menos 8 caracteres.')
    }
    if (newPassword !== confirmPassword) {
      return setPasswordError('As senhas não conferem.')
    }
    if (saving) return

    setSaving(true)
    try {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ novaSenha: newPassword }),
      })

      const refreshed = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          matricula: user?.matricula || matricula,
          senha: newPassword,
        }),
      })

      setNewPassword('')
      setConfirmPassword('')
      setPasswordDialog(false)
      setUser(refreshed.user)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Falha ao trocar senha.')
    } finally {
      setSaving(false)
    }
  }

  async function openAudit() {
    if (!canAudit) return
    const query = isClient
      ? '?audit=1&mes=' + encodeURIComponent(selectedMonth)
      : '?audit=1'
    const data = await api('/api/retrabalhos' + query)
    setAudits(data.data || [])
    setAuditDialog(true)
  }

  async function openPrices() {
    await loadPrices()
    setPricesDialog(true)
  }

  async function createPrice() {
    if (!canManagePrices || saving) return
    setSaving(true)
    try {
      await api('/api/precos', {
        method: 'POST',
        body: JSON.stringify({
          requestId: priceForm.requestId,
          vigenciaInicio: isoDate(priceForm.vigenciaInicio),
          valorNacionalizacao: priceForm.valorNacionalizacao,
          valorRfidAdicional: priceForm.valorRfidAdicional,
          observacao: priceForm.observacao.trim(),
        }),
      })
      await loadPrices()
      setPriceForm(createPriceForm())
    } finally {
      setSaving(false)
    }
  }

  function exportReworks() {
    const label = isClient ? selectedMonth : 'completo'
    downloadCsv(
      `retrabalho-unilog-${label}.csv`,
      [
        'Data efetivação',
        'SKU',
        'Descrição',
        'Qtd retrabalhada',
        'Validade inserida',
        'Etiquetas Nacionalização',
        'Etiquetas RFID',
        'Preço unit. Nacionalização',
        'Preço adicional RFID',
        'Valor Nacionalização',
        'Valor RFID',
        'Valor total cobrança',
        'ID preço',
        'Criado por',
        'Criado em',
        'Atualizado por',
        'Atualizado em',
        'Versão',
      ],
      items.map(item => [
        item.dataEfetivacao,
        item.sku,
        item.descricao,
        item.quantidade,
        item.dataValidade,
        item.nacionalizacao,
        item.rfid,
        item.precoNacionalizacaoUnit.toFixed(2).replace('.', ','),
        item.precoRfidAdicionalUnit.toFixed(2).replace('.', ','),
        item.valorNacionalizacao.toFixed(2).replace('.', ','),
        item.valorRfidAdicional.toFixed(2).replace('.', ','),
        item.valorTotalCobranca.toFixed(2).replace('.', ','),
        item.idPreco,
        item.matriculaCriacao,
        item.criadoEm,
        item.matriculaAtualizacao || '',
        item.atualizadoEm || '',
        item.versao,
      ])
    )
  }

  function exportAudits() {
    const label = isClient ? selectedMonth : 'completo'
    downloadCsv(
      `auditoria-retrabalho-unilog-${label}.csv`,
      [
        'Data/hora',
        'Entidade',
        'Registro',
        'Ação',
        'Autor',
        'Versão anterior',
        'Versão nova',
        'Dados antes',
        'Dados depois',
      ],
      audits.map(item => [
        item.dataHora,
        item.entidade,
        item.idRegistro,
        item.acao,
        item.matriculaAutor,
        item.versaoAnterior,
        item.versaoNova,
        item.dadosAntes,
        item.dadosDepois,
      ])
    )
  }

  const totals = useMemo(() => ({
    registros: items.length,
    unidades: items.reduce((a, b) => a + Number(b.quantidade || 0), 0),
    etiquetas: items.reduce((a, b) => a + Number(b.totalEtiquetas || 0), 0),
    valor: items.reduce((a, b) => a + Number(b.valorTotalCobranca || 0), 0),
  }), [items])

  const previewPrice = useMemo(() => {
    const date = isoDate(form.dataEfetivacao)
    const price = prices.find(p =>
      p.vigenciaInicio <= date && (!p.vigenciaFim || p.vigenciaFim >= date)
    )
    if (!price) return null

    const nat = Number(form.nacionalizacao || 0) * Number(price.valorNacionalizacao || 0)
    const rfid = Number(form.rfid || 0) * Number(price.valorRfidAdicional || 0)
    return {
      price,
      nat,
      rfid,
      total: nat + rfid,
    }
  }, [form.dataEfetivacao, form.nacionalizacao, form.rfid, prices])

  if (loadingSession) {
    return (
      <div className="session-loading">
        <i className="pi pi-spin pi-spinner" /> Validando sessão...
      </div>
    )
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <aside className="login-brand" aria-label="Retrabalho Controle Unilog">
            <div className="login-brand-topline">
              <img src="/brand/unilog-logo-white-transparent.svg" alt="Unilog Express" />
              <span className="product-chip">Retrabalho</span>
            </div>
            <div className="login-brand-copy">
              <span className="overline">GESTÃO OPERACIONAL</span>
              <h1>Retrabalho com rastreabilidade e cobrança controlada.</h1>
              <p>Execução, etiquetagem, vigências de preço e auditoria reunidas em um único ambiente operacional.</p>
            </div>
            <div className="proof">
              <span><i className="pi pi-shield" /> Acesso protegido</span>
              <span><i className="pi pi-history" /> Histórico auditável</span>
            </div>
          </aside>

          <form className="login-form" onSubmit={login}>
            <small>ACESSO AO SISTEMA</small>
            <h2>Entrar</h2>
            <p>Use sua matrícula e senha.</p>
            <label>Matrícula</label>
            <InputText value={matricula} onChange={e => setMatricula(e.target.value)} required />
            <label>Senha</label>
            <Password value={senha} onChange={e => setSenha(e.target.value)} feedback={false} toggleMask required />
            {authError && (
              <div className="error">
                <i className="pi pi-exclamation-circle" />{authError}
              </div>
            )}
            <Button label="Acessar" icon="pi pi-sign-in" className="primary" />
          </form>
        </section>
      </main>
    )
  }

  if (user.trocaSenhaObrigatoria) {
    return (
      <main className="login-page">
        <section className="login-card" aria-labelledby="first-access-title">
          <aside className="login-brand" aria-label="Retrabalho Controle Unilog">
            <div className="login-brand-topline">
              <img src="/brand/unilog-logo-white-transparent.svg" alt="Unilog Express" />
              <span className="product-chip">Retrabalho</span>
            </div>
            <div className="login-brand-copy">
              <span className="overline">PRIMEIRO ACESSO</span>
              <h1>Segurança desde o primeiro acesso.</h1>
              <p>A senha recebida é temporária. Defina sua própria senha antes de acessar os dados operacionais.</p>
            </div>
            <div className="proof">
              <span><i className="pi pi-shield" /> Credenciais protegidas</span>
              <span><i className="pi pi-lock" /> Senha não armazenada em texto puro</span>
            </div>
          </aside>

          <section className="login-form first-access-form">
            <span className="login-overline">PRIMEIRO ACESSO</span>
            <h2 id="first-access-title">Crie sua própria senha</h2>
            <p>A nova senha substitui a senha temporária e libera sua sessão sem exigir outro login.</p>

            <label>Matrícula</label>
            <InputText value={user.matricula} disabled />

            <label htmlFor="first-new-password">Nova senha</label>
            <Password
              inputId="first-new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              toggleMask
              feedback={false}
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              required
            />

            <label htmlFor="first-confirm-password">Confirmar nova senha</label>
            <Password
              inputId="first-confirm-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              toggleMask
              feedback={false}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              required
            />

            {passwordError && (
              <div className="error">
                <i className="pi pi-exclamation-circle" />{passwordError}
              </div>
            )}

            <Button
              label={saving ? 'Salvando…' : 'Definir minha senha'}
              icon={saving ? 'pi pi-spin pi-spinner' : 'pi pi-check'}
              iconPos="right"
              className="primary"
              loading={false}
              disabled={saving}
              onClick={changePassword}
            />

            <div className="login-security-note">
              <i className="pi pi-info-circle" />
              <span>Depois da alteração, você seguirá diretamente para o sistema com a mesma sessão autenticada.</span>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <b>UNILOG</b>
          <small>RETRABALHO</small>
        </div>

        <nav>
          <button className="nav active">
            <i className="pi pi-clipboard" />
            {isClient ? 'Acompanhamento' : 'Lançamentos'}
          </button>
          {canAudit && (
            <button className="nav" onClick={openAudit}>
              <i className="pi pi-history" /> Auditoria
            </button>
          )}
          {canViewPrices && (
            <button className="nav" onClick={openPrices}>
              <i className="pi pi-dollar" /> Preços
            </button>
          )}
          {canUsers && (
            <div className="nav-section">
              <span className="nav-caption">ADMINISTRAÇÃO</span>
              <button className="nav" onClick={openUsers}>
                <i className="pi pi-users" /> Usuários
              </button>
            </div>
          )}
        </nav>

        <div className="user-card">
          <div className="avatar">{user.nome.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.nome}</strong>
            <span>{user.matricula} · {user.perfil}</span>
          </div>
          <div className="user-actions">
            <button title="Alterar senha" onClick={() => setPasswordDialog(true)}>
              <i className="pi pi-key" />
            </button>
            <button title="Sair" onClick={logout}>
              <i className="pi pi-sign-out" />
            </button>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <small>{isClient ? 'CLIENTE / ACOMPANHAMENTO' : 'OPERAÇÃO / CONTROLE'}</small>
            <h1>{isClient ? 'Acompanhamento mensal' : 'Retrabalho'}</h1>
          </div>

          <div className="topbar-actions">
            {isClient && (
              <label className="month-control">
                <span>Competência</span>
                <select
                  value={selectedMonth}
                  onChange={e => void changeMonth(e.target.value)}
                  disabled={loading}
                >
                  {(months.length ? months : [selectedMonth]).map(month => (
                    <option key={month} value={month}>{monthLabel(month)}</option>
                  ))}
                </select>
              </label>
            )}
            {canExport && (
              <Button
                label="Exportar"
                icon="pi pi-download"
                outlined
                className="compact"
                onClick={exportReworks}
                disabled={!items.length}
              />
            )}
            {canCreate && (
              <Button
                label="Novo lançamento"
                icon="pi pi-plus"
                className="primary compact"
                onClick={openNew}
              />
            )}
          </div>
        </header>

        <div className="metrics metrics-4">
          <article>
            <i className="pi pi-list" />
            <div><span>Registros</span><strong>{totals.registros}</strong></div>
          </article>
          <article>
            <i className="pi pi-box" />
            <div><span>Unidades retrabalhadas</span><strong>{totals.unidades.toLocaleString('pt-BR')}</strong></div>
          </article>
          <article>
            <i className="pi pi-tags" />
            <div><span>Etiquetas aplicadas</span><strong>{totals.etiquetas.toLocaleString('pt-BR')}</strong></div>
          </article>
          <article>
            <i className="pi pi-wallet" />
            <div><span>Valor a cobrar</span><strong>{money(totals.valor)}</strong></div>
          </article>
        </div>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{isClient ? 'Detalhamento da competência' : 'Histórico de retrabalho'}</h2>
              <p>
                {isClient
                  ? `Consulta somente leitura · ${monthLabel(selectedMonth)}`
                  : 'Operacional inclui registros; Supervisor e Admin podem corrigir dados com auditoria.'}
              </p>
            </div>
            <Button
              icon="pi pi-refresh"
              text
              rounded
              onClick={() => void loadItems(isClient ? selectedMonth : undefined)}
              loading={loading}
            />
          </div>

          <DataTable
            value={items}
            loading={loading}
            paginator
            rows={15}
            dataKey="id"
            emptyMessage="Nenhum retrabalho registrado para o período."
            onRowDoubleClick={e => openEdit(e.data as Rework)}
            stripedRows
            scrollable
          >
            <Column field="dataEfetivacao" header="Data" />
            <Column field="sku" header="SKU" />
            <Column field="descricao" header="Descrição" />
            <Column field="quantidade" header="Qtd." />
            <Column field="dataValidade" header="Validade" />
            <Column field="nacionalizacao" header="Nacionalização" />
            <Column field="rfid" header="RFID" />
            <Column
              field="valorTotalCobranca"
              header="Valor"
              body={(row: Rework) => money(row.valorTotalCobranca)}
            />
            <Column field="matriculaCriacao" header="Criado por" />
            <Column
              header=""
              body={(row: Rework) =>
                canEdit
                  ? <Button icon="pi pi-pencil" text rounded onClick={() => openEdit(row)} />
                  : null
              }
            />
          </DataTable>
        </section>
      </section>

      <Dialog
        header={form.id ? 'Editar retrabalho' : 'Novo retrabalho'}
        visible={dialog}
        onHide={() => !saving && setDialog(false)}
        style={{ width: 'min(760px, 96vw)' }}
      >
        <div className="form-grid">
          <label>
            Data de efetivação
            <Calendar
              value={form.dataEfetivacao}
              onChange={e => setForm({ ...form, dataEfetivacao: e.value as Date })}
              dateFormat="dd/mm/yy"
            />
          </label>
          <label>
            SKU
            <InputText value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label className="span-2">
            Descrição
            <InputText value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </label>
          <label>
            Quantidade retrabalhada
            <InputNumber
              value={form.quantidade}
              onValueChange={e => setForm({ ...form, quantidade: e.value || 0 })}
              min={1}
            />
          </label>
          <label>
            Validade inserida
            <Calendar
              value={form.dataValidade}
              onChange={e => setForm({ ...form, dataValidade: e.value as Date })}
              dateFormat="dd/mm/yy"
              showButtonBar
            />
          </label>
          <label>
            Etiquetas nacionalização
            <InputNumber
              value={form.nacionalizacao}
              onValueChange={e => setForm({ ...form, nacionalizacao: e.value || 0 })}
              min={0}
            />
          </label>
          <label>
            Etiquetas RFID
            <InputNumber
              value={form.rfid}
              onValueChange={e => setForm({ ...form, rfid: e.value || 0 })}
              min={0}
            />
          </label>
        </div>

        <div className="billing-preview">
          <div>
            <span>Nacionalização</span>
            <strong>{previewPrice ? money(previewPrice.nat) : 'Sem vigência'}</strong>
            <small>
              {previewPrice
                ? `${form.nacionalizacao} × ${money(previewPrice.price.valorNacionalizacao)}`
                : 'Cadastre uma tabela válida para a data.'}
            </small>
          </div>
          <div>
            <span>RFID adicional</span>
            <strong>{previewPrice ? money(previewPrice.rfid) : '—'}</strong>
            <small>
              {previewPrice
                ? `${form.rfid} × ${money(previewPrice.price.valorRfidAdicional)}`
                : '—'}
            </small>
          </div>
          <div className="billing-total">
            <span>Total previsto</span>
            <strong>{previewPrice ? money(previewPrice.total) : '—'}</strong>
            <small>O valor definitivo é calculado pelo backend ao salvar.</small>
          </div>
        </div>

        <div className="dialog-actions">
          <Button label="Cancelar" text disabled={saving} onClick={() => setDialog(false)} />
          <Button label="Salvar" icon="pi pi-check" className="primary" loading={saving} onClick={save} />
        </div>
      </Dialog>

      <Dialog
        header="Usuários"
        visible={usersDialog}
        onHide={() => setUsersDialog(false)}
        maximizable
        style={{ width: 'min(1040px, 96vw)' }}
      >
        <div className="user-form">
          <InputText
            placeholder="Matrícula"
            value={newUser.matricula}
            onChange={e => setNewUser({ ...newUser, matricula: e.target.value })}
          />
          <InputText
            placeholder="Nome"
            value={newUser.nome}
            onChange={e => setNewUser({ ...newUser, nome: e.target.value })}
          />
          <select
            value={newUser.perfil}
            onChange={e => setNewUser({ ...newUser, perfil: e.target.value as Profile })}
          >
            <option>OPERACIONAL</option>
            <option>SUPERVISOR</option>
            <option>ADMIN</option>
            <option>CLIENTE</option>
          </select>
          <InputText
            placeholder="Senha temporária"
            type="password"
            value={newUser.senhaTemporaria}
            onChange={e => setNewUser({ ...newUser, senhaTemporaria: e.target.value })}
          />
          <Button label="Criar" onClick={createUser} loading={saving} className="primary" />
        </div>

        <DataTable value={users} rows={15} paginator dataKey="matricula">
          <Column field="matricula" header="Matrícula" />
          <Column field="nome" header="Nome" />
          <Column field="perfil" header="Perfil" body={(r: ManagedUser) => <Tag value={r.perfil} />} />
          <Column
            field="ativo"
            header="Ativo"
            body={(r: ManagedUser) => (
              <Tag severity={r.ativo === 'SIM' ? 'success' : 'secondary'} value={r.ativo} />
            )}
          />
          <Column field="trocaSenhaObrigatoria" header="Troca pendente" />
          <Column
            header=""
            body={(r: ManagedUser) => (
              <Button icon="pi pi-pencil" text rounded onClick={() => setEditingUser({ ...r })} />
            )}
          />
        </DataTable>
      </Dialog>

      <Dialog
        header="Editar usuário"
        visible={Boolean(editingUser)}
        onHide={() => !saving && setEditingUser(null)}
        style={{ width: 'min(520px, 94vw)' }}
      >
        {editingUser && (
          <div className="form-grid single">
            <label>Matrícula<InputText value={editingUser.matricula} disabled /></label>
            <label>Nome<InputText value={editingUser.nome} disabled /></label>
            <label>
              Perfil
              <select
                value={editingUser.perfil}
                onChange={e => setEditingUser({ ...editingUser, perfil: e.target.value as Profile })}
              >
                <option>OPERACIONAL</option>
                <option>SUPERVISOR</option>
                <option>ADMIN</option>
                <option>CLIENTE</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={editingUser.ativo}
                onChange={e => setEditingUser({
                  ...editingUser,
                  ativo: e.target.value as 'SIM' | 'NAO',
                })}
              >
                <option value="SIM">Ativo</option>
                <option value="NAO">Inativo</option>
              </select>
            </label>
          </div>
        )}

        <div className="dialog-actions">
          <Button label="Cancelar" text disabled={saving} onClick={() => setEditingUser(null)} />
          <Button label="Salvar" className="primary" loading={saving} onClick={updateUser} />
        </div>
      </Dialog>

      <Dialog
        header="Tabela de preços"
        visible={pricesDialog}
        onHide={() => setPricesDialog(false)}
        maximizable
        style={{ width: 'min(1080px, 96vw)' }}
      >
        {canManagePrices && (
          <div className="price-create">
            <label>
              Nova vigência
              <Calendar
                value={priceForm.vigenciaInicio}
                onChange={e => setPriceForm({ ...priceForm, vigenciaInicio: e.value as Date })}
                dateFormat="dd/mm/yy"
              />
            </label>
            <label>
              Nacionalização
              <InputNumber
                value={priceForm.valorNacionalizacao}
                onValueChange={e => setPriceForm({ ...priceForm, valorNacionalizacao: e.value || 0 })}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
                min={0}
              />
            </label>
            <label>
              RFID adicional
              <InputNumber
                value={priceForm.valorRfidAdicional}
                onValueChange={e => setPriceForm({ ...priceForm, valorRfidAdicional: e.value || 0 })}
                mode="currency"
                currency="BRL"
                locale="pt-BR"
                min={0}
              />
            </label>
            <label className="price-observation">
              Observação
              <InputText
                value={priceForm.observacao}
                onChange={e => setPriceForm({ ...priceForm, observacao: e.target.value })}
                placeholder="Motivo ou referência da alteração"
              />
            </label>
            <Button
              label="Criar vigência"
              icon="pi pi-plus"
              className="primary"
              loading={saving}
              onClick={createPrice}
            />
          </div>
        )}

        <div className="price-rule">
          <strong>Regra de cobrança:</strong> Nacionalização + adicional RFID.
          Com os valores iniciais, uma unidade com as duas etiquetas = R$ 0,60.
        </div>

        <DataTable value={prices} paginator rows={10} dataKey="id" emptyMessage="Nenhuma vigência cadastrada.">
          <Column field="vigenciaInicio" header="Início" />
          <Column field="vigenciaFim" header="Fim" body={(r: PriceRow) => r.vigenciaFim || 'Vigente'} />
          <Column
            field="valorNacionalizacao"
            header="Nacionalização"
            body={(r: PriceRow) => money(r.valorNacionalizacao)}
          />
          <Column
            field="valorRfidAdicional"
            header="RFID adicional"
            body={(r: PriceRow) => money(r.valorRfidAdicional)}
          />
          <Column field="observacao" header="Observação" />
          <Column field="criadoPor" header="Criado por" />
        </DataTable>
      </Dialog>

      <Dialog
        header="Auditoria"
        visible={auditDialog}
        onHide={() => setAuditDialog(false)}
        maximizable
        style={{ width: 'min(1200px, 96vw)' }}
      >
        <div className="audit-toolbar">
          <div>
            <strong>{isClient ? monthLabel(selectedMonth) : 'Histórico completo'}</strong>
            <span>{audits.length} evento(s)</span>
          </div>
          {canExport && (
            <Button
              label="Exportar auditoria"
              icon="pi pi-download"
              outlined
              className="compact"
              onClick={exportAudits}
              disabled={!audits.length}
            />
          )}
        </div>

        <DataTable value={audits} paginator rows={20} scrollable dataKey="idAuditoria">
          <Column field="dataHora" header="Data/hora" />
          <Column field="entidade" header="Entidade" />
          <Column field="idRegistro" header="Registro" />
          <Column field="acao" header="Ação" />
          <Column field="matriculaAutor" header="Autor" />
          <Column field="versaoAnterior" header="Versão anterior" />
          <Column field="versaoNova" header="Versão nova" />
          <Column
            header=""
            body={(r: AuditRow) => (
              <Button
                icon="pi pi-search"
                text
                rounded
                title="Ver detalhes"
                onClick={() => setSelectedAudit(r)}
              />
            )}
          />
        </DataTable>
      </Dialog>

      <Dialog
        header="Detalhes da auditoria"
        visible={Boolean(selectedAudit)}
        onHide={() => setSelectedAudit(null)}
        style={{ width: 'min(900px, 96vw)' }}
      >
        {selectedAudit && (
          <div className="audit-details">
            <div>
              <span>Registro</span>
              <strong>{selectedAudit.idRegistro}</strong>
            </div>
            <div>
              <span>Ação</span>
              <strong>{selectedAudit.acao}</strong>
            </div>
            <section>
              <h3>Antes</h3>
              <pre>{selectedAudit.dadosAntes || 'Sem estado anterior.'}</pre>
            </section>
            <section>
              <h3>Depois</h3>
              <pre>{selectedAudit.dadosDepois || 'Sem estado posterior.'}</pre>
            </section>
          </div>
        )}
      </Dialog>

      <Dialog
        header={user.trocaSenhaObrigatoria ? 'Defina sua nova senha' : 'Alterar senha'}
        visible={passwordDialog}
        closable={!user.trocaSenhaObrigatoria}
        closeOnEscape={!user.trocaSenhaObrigatoria}
        onHide={() => {
          if (!user.trocaSenhaObrigatoria) setPasswordDialog(false)
        }}
        style={{ width: 'min(480px, 94vw)' }}
      >
        {user.trocaSenhaObrigatoria && (
          <p className="dialog-note">
            Este é seu primeiro acesso. Troque a senha temporária para continuar utilizando o sistema.
          </p>
        )}

        <div className="password-form">
          <label>
            Nova senha
            <Password
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              toggleMask
              feedback={false}
            />
          </label>
          <label>
            Confirmar nova senha
            <Password
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              toggleMask
              feedback={false}
            />
          </label>
          {passwordError && (
            <div className="error">
              <i className="pi pi-exclamation-circle" />{passwordError}
            </div>
          )}
        </div>

        <div className="dialog-actions">
          {!user.trocaSenhaObrigatoria && (
            <Button label="Cancelar" text disabled={saving} onClick={() => setPasswordDialog(false)} />
          )}
          <Button
            label="Alterar senha"
            icon="pi pi-key"
            className="primary"
            loading={saving}
            onClick={changePassword}
          />
        </div>
      </Dialog>
    </main>
  )
}
