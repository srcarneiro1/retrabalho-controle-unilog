'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { MultiSelect } from 'primereact/multiselect'
import { Password } from 'primereact/password'
import { Tag } from 'primereact/tag'

type Profile = 'OPERACIONAL' | 'SUPERVISOR' | 'ADMIN' | 'CLIENTE'
type Section = 'lancamentos' | 'maoDeObra' | 'auditoria' | 'precos' | 'usuarios'

const PROFILE_OPTIONS = [
  { label: 'OPERACIONAL', value: 'OPERACIONAL' },
  { label: 'SUPERVISOR', value: 'SUPERVISOR' },
  { label: 'ADMIN', value: 'ADMIN' },
  { label: 'CLIENTE', value: 'CLIENTE' },
]

const USER_STATUS_OPTIONS = [
  { label: 'Ativo', value: 'SIM' },
  { label: 'Inativo', value: 'NAO' },
]

type User = {
  matricula: string
  nome: string
  perfil: Profile
  trocaSenhaObrigatoria?: boolean
}

type Branch = {
  cnpj: string
  nomeCliente: string
  filial: string
  ativo: string
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
  validade: number
  totalEtiquetas: number
  idPreco: string
  precoNacionalizacaoUnit: number
  precoRfidAdicionalUnit: number
  precoValidadeUnit: number
  valorNacionalizacao: number
  valorRfidAdicional: number
  valorValidade: number
  valorTotalCobranca: number
  valorCobrancaEfetiva: number
  cobrancaCancelada: boolean
  canceladoEm: string
  canceladoPor: string
  motivoCancelamento: string
  cnpjCliente: string
  nomeCliente: string
  filial: string
  matriculaCriacao: string
  criadoEm: string
  matriculaAtualizacao?: string
  atualizadoEm?: string
  versao: number
}

type LaborRow = {
  id: string
  requestId?: string
  data: string
  cnpjCliente: string
  nomeCliente: string
  filial: string
  qtdCasa: number
  qtdTerceiros: number
  qtdTotal: number
  observacao: string
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
  cnpjs: string[]
}

type PriceRow = {
  id: string
  vigenciaInicio: string
  vigenciaFim: string
  valorNacionalizacao: number
  valorRfidAdicional: number
  valorValidade: number
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
    cnpjCliente: '',
    // Vazios por padrão: o usuário digita sem precisar apagar um 0.
    quantidade: null as number | null,
    nacionalizacao: null as number | null,
    rfid: null as number | null,
    versao: 0,
  }
}

function createLaborForm() {
  return {
    id: '',
    requestId: crypto.randomUUID(),
    data: new Date(),
    cnpjCliente: '',
    qtdCasa: null as number | null,
    qtdTerceiros: null as number | null,
    observacao: '',
    versao: 0,
  }
}

function createPriceForm() {
  return {
    requestId: crypto.randomUUID(),
    vigenciaInicio: new Date(),
    valorNacionalizacao: 0.4100,
    valorRfidAdicional: 0.1900,
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
  const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
    .format(new Date(y, m - 1, 1))
  return month.charAt(0).toUpperCase() + month.slice(1) + ' ' + y
}

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function rateMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

function intLabel(value: number | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function dateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function cnpjLabel(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 14) return value
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function branchLabel(branch: Branch) {
  return `${branch.nomeCliente} · ${branch.filial} · ${cnpjLabel(branch.cnpj)}`
}

const SIDEBAR_PREF_KEY = 'retrabalho-unilog:sidebar'
// ≤ 1100 px: drawer. 1101–1279 px: menu recolhido automaticamente. ≥ 1280 px: preferência do usuário.
const DRAWER_QUERY = '(max-width: 1100px)'
const COMPACT_QUERY = '(min-width: 1101px) and (max-width: 1279px)'

function readSidebarPref() {
  try { return localStorage.getItem(SIDEBAR_PREF_KEY) === 'collapsed' } catch { return false }
}

function writeSidebarPref(collapsed: boolean) {
  try { localStorage.setItem(SIDEBAR_PREF_KEY, collapsed ? 'collapsed' : 'expanded') } catch { /* sem storage */ }
}

// Meses (AAAA-MM) presentes nos registros, do mais recente para o mais antigo.
function monthsOf(values: string[]) {
  const seen: Record<string, true> = {}
  values.forEach(value => {
    const month = String(value || '').slice(0, 7)
    if (/^\d{4}-\d{2}$/.test(month)) seen[month] = true
  })
  return Object.keys(seen).sort().reverse()
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
  const [authLoading, setAuthLoading] = useState(false)
  const [section, setSection] = useState<Section>('lancamentos')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const [items, setItems] = useState<Rework[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [allBranches, setAllBranches] = useState<Branch[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth())
  const [clientBranchFilter, setClientBranchFilter] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  // Filtro de mês dos perfis internos ('' = todos os meses).
  const [reworkMonth, setReworkMonth] = useState('')
  const [loading, setLoading] = useState(false)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceSlow, setWorkspaceSlow] = useState(false)
  const [workspaceError, setWorkspaceError] = useState('')
  const [baseConnected, setBaseConnected] = useState(false)
  const [apiVersion, setApiVersion] = useState('')
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState(createForm)
  const [dialog, setDialog] = useState(false)
  const [formError, setFormError] = useState('')

  const [labor, setLabor] = useState<LaborRow[]>([])
  const [laborLoading, setLaborLoading] = useState(false)
  const [laborMonth, setLaborMonth] = useState('')
  const [laborForm, setLaborForm] = useState(createLaborForm)
  const [laborDialog, setLaborDialog] = useState(false)
  const [laborError, setLaborError] = useState('')

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [userError, setUserError] = useState('')
  const [newUser, setNewUser] = useState({
    matricula: '',
    nome: '',
    perfil: 'OPERACIONAL' as Profile,
    senhaTemporaria: '',
    cnpjs: [] as string[],
  })
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)

  const [audits, setAudits] = useState<AuditRow[]>([])
  const [selectedAudit, setSelectedAudit] = useState<AuditRow | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Rework | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')

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
  // Tabela de preços é interna: CLIENTE não visualiza.
  const canViewPrices = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN'
  const canExport = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN' || user?.perfil === 'CLIENTE'
  const canLabor = Boolean(user && user.perfil !== 'CLIENTE')

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

  async function loadBranches() {
    try {
      const data = await api('/api/filiais')
      setBranches(data.data || [])
      return data.data || []
    } catch {
      setBranches([])
      return []
    }
  }

  async function loadAllBranches() {
    try {
      const data = await api('/api/filiais?all=1')
      setAllBranches(data.data || [])
      return data.data || []
    } catch {
      setAllBranches([])
      return []
    }
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
    setLoading(true)
    try {
      if (isClient) {
        const data = await api('/api/bootstrap?period=1&mes=' + encodeURIComponent(value))
        setItems(data.items || [])
        setAudits(data.audits || [])
        setBaseConnected(data.connected === true)
        setApiVersion(String(data.apiVersion || ''))
      } else {
        await loadItems(value)
      }
    } catch (error) {
      setBaseConnected(false)
      throw error
    } finally {
      setLoading(false)
    }
  }

  // Sidebar responsiva: reage à mudança de largura da janela, não só ao carregamento.
  useEffect(() => {
    const drawer = window.matchMedia(DRAWER_QUERY)
    const compact = window.matchMedia(COMPACT_QUERY)
    const sync = () => {
      if (!drawer.matches) setMobileOpen(false)
      if (compact.matches) setCollapsed(true)
      else if (!drawer.matches) setCollapsed(readSidebarPref())
    }
    sync()
    drawer.addEventListener('change', sync)
    compact.addEventListener('change', sync)
    return () => {
      drawer.removeEventListener('change', sync)
      compact.removeEventListener('change', sync)
    }
  }, [])

  // Drawer móvel: ESC fecha e o fundo não rola enquanto estiver aberto.
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileOpen])

  useEffect(() => {
    api('/api/auth/me')
      .then(r => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoadingSession(false))
  }, [])

  useEffect(() => {
    if (!user || user.trocaSenhaObrigatoria) return
    void initializeWorkspace(user)
  }, [user])

  async function initializeWorkspace(currentUser: User) {
    if (currentUser.trocaSenhaObrigatoria) return

    setWorkspaceLoading(true)
    setWorkspaceReady(false)
    setWorkspaceSlow(false)
    setWorkspaceError('')
    setBaseConnected(false)

    const slowTimer = window.setTimeout(() => setWorkspaceSlow(true), 2500)

    try {
      const data = await api('/api/bootstrap')

      setPrices(data.prices || [])
      setBranches(data.branches || [])
      setItems(data.items || [])
      setAudits(data.audits || [])
      setMonths(data.months || [])
      setAllBranches(data.allBranches || [])
      setUsers(data.users || [])
      setLabor(data.labor || [])
      // Abre no mês mais recente com dados; sem dados, no mês corrente.
      setReworkMonth(
        monthsOf((data.items || []).map((x: Rework) => x.dataEfetivacao))[0] || currentMonth()
      )
      setLaborMonth(
        monthsOf((data.labor || []).map((x: LaborRow) => x.data))[0] || currentMonth()
      )

      if (currentUser.perfil === 'CLIENTE') {
        setSelectedMonth(data.selectedMonth || currentMonth())
      }

      setApiVersion(String(data.apiVersion || ''))
      setBaseConnected(data.connected === true)
      setWorkspaceReady(true)
    } catch (error) {
      setBaseConnected(false)
      setWorkspaceError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os dados iniciais.'
      )
    } finally {
      window.clearTimeout(slowTimer)
      setWorkspaceLoading(false)
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault()
    if (authLoading) return
    setAuthLoading(true)
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
    } finally {
      setAuthLoading(false)
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => null)
    setUser(null)
    setPasswordDialog(false)
    setItems([])
    setBranches([])
    setAllBranches([])
    setLabor([])
    setWorkspaceReady(false)
    setWorkspaceError('')
    setBaseConnected(false)
    setApiVersion('')
  }

  function openNew() {
    if (!canCreate) return
    const next = createForm()
    if (branches.length === 1) next.cnpjCliente = branches[0].cnpj
    setForm(next)
    setFormError('')
    setDialog(true)
  }

  function openEdit(row: Rework) {
    if (!canEdit || row.cobrancaCancelada) return
    setForm({
      id: row.id,
      requestId: row.requestId || '',
      dataEfetivacao: fromIso(row.dataEfetivacao) || new Date(),
      sku: row.sku,
      descricao: row.descricao,
      cnpjCliente: row.cnpjCliente,
      quantidade: row.quantidade || null,
      nacionalizacao: row.nacionalizacao || null,
      rfid: row.rfid || null,
      versao: row.versao,
    })
    setFormError('')
    setDialog(true)
  }

  async function save() {
    if (saving || !canCreate) return
    setSaving(true)
    setFormError('')
    try {
      if (!form.cnpjCliente) throw new Error('Selecione a filial.')
      if (Number(form.quantidade || 0) < 1) throw new Error('Informe a quantidade retrabalhada.')
      if (Number(form.nacionalizacao || 0) + Number(form.rfid || 0) <= 0) {
        throw new Error('Informe ao menos uma etiqueta: Nacionalização e/ou RFID/ADIPAC.')
      }

      const payload = {
        id: form.id || undefined,
        requestId: form.requestId,
        dataEfetivacao: isoDate(form.dataEfetivacao),
        sku: form.sku.trim(),
        descricao: form.descricao.trim(),
        cnpjCliente: form.cnpjCliente,
        quantidade: form.quantidade ?? 0,
        nacionalizacao: form.nacionalizacao ?? 0,
        rfid: form.rfid ?? 0,
        versao: form.versao,
      }

      await api('/api/retrabalhos', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })

      setDialog(false)
      if (!isClient && reworkMonth) setReworkMonth(isoDate(form.dataEfetivacao).slice(0, 7))
      await loadItems(isClient ? selectedMonth : undefined)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function openLabor() {
    if (!canLabor) return
    setSection('maoDeObra')
    setMobileOpen(false)
  }

  async function loadLabor() {
    if (!canLabor) return
    setLaborLoading(true)
    try {
      const data = await api('/api/mao-de-obra')
      setLabor(data.data || [])
    } finally {
      setLaborLoading(false)
    }
  }

  function openNewLabor() {
    if (!canLabor) return
    const next = createLaborForm()
    if (branches.length === 1) next.cnpjCliente = branches[0].cnpj
    setLaborForm(next)
    setLaborError('')
    setLaborDialog(true)
  }

  function openEditLabor(row: LaborRow) {
    if (!canEdit) return
    setLaborForm({
      id: row.id,
      requestId: row.requestId || '',
      data: fromIso(row.data) || new Date(),
      cnpjCliente: row.cnpjCliente,
      qtdCasa: row.qtdCasa || null,
      qtdTerceiros: row.qtdTerceiros || null,
      observacao: row.observacao || '',
      versao: row.versao,
    })
    setLaborError('')
    setLaborDialog(true)
  }

  async function saveLabor() {
    if (saving || !canLabor) return
    setSaving(true)
    setLaborError('')
    try {
      if (!laborForm.cnpjCliente) throw new Error('Selecione a filial.')
      if (Number(laborForm.qtdCasa || 0) + Number(laborForm.qtdTerceiros || 0) <= 0) {
        throw new Error('Informe ao menos uma pessoa (casa ou terceiros).')
      }
      await api('/api/mao-de-obra', {
        method: laborForm.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          id: laborForm.id || undefined,
          requestId: laborForm.requestId,
          data: isoDate(laborForm.data),
          cnpjCliente: laborForm.cnpjCliente,
          qtdCasa: laborForm.qtdCasa ?? 0,
          qtdTerceiros: laborForm.qtdTerceiros ?? 0,
          observacao: laborForm.observacao.trim(),
          versao: laborForm.versao,
        }),
      })
      setLaborDialog(false)
      if (laborMonth) setLaborMonth(isoDate(laborForm.data).slice(0, 7))
      await loadLabor()
    } catch (error) {
      setLaborError(error instanceof Error ? error.message : 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  function exportLabor() {
    downloadCsv(
      `mao-de-obra-unilog-${laborMonth || 'completo'}.csv`,
      [
        'Data',
        'Cliente',
        'Filial',
        'CNPJ',
        'Mão de obra da casa',
        'Terceiros',
        'Total',
        'Observação',
        'Criado por',
        'Criado em',
        'Atualizado por',
        'Atualizado em',
        'Versão',
      ],
      visibleLabor.map(row => [
        row.data,
        row.nomeCliente,
        row.filial,
        cnpjLabel(row.cnpjCliente),
        row.qtdCasa,
        row.qtdTerceiros,
        row.qtdTotal,
        row.observacao,
        row.matriculaCriacao,
        row.criadoEm,
        row.matriculaAtualizacao || '',
        row.atualizadoEm || '',
        row.versao,
      ])
    )
  }

  function openUsers() {
    setSection('usuarios')
    setMobileOpen(false)
  }

  async function reloadUsers() {
    const data = await api('/api/usuarios')
    setUsers(data.data || [])
  }

  async function createUser() {
    if (saving) return
    setUserError('')
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
        cnpjs: [],
      })
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Falha ao criar usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function updateUser() {
    if (!editingUser || saving) return
    setUserError('')
    setSaving(true)
    try {
      await api('/api/usuarios', {
        method: 'PUT',
        body: JSON.stringify({
          matricula: editingUser.matricula,
          perfil: editingUser.perfil,
          ativo: editingUser.ativo,
          cnpjs: editingUser.cnpjs || [],
          versao: editingUser.versao,
        }),
      })
      setEditingUser(null)
      await reloadUsers()
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Falha ao atualizar usuário.')
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

  function openAudit() {
    if (!canAudit) return
    setSection('auditoria')
    setMobileOpen(false)
  }

  async function reloadAudit() {
    if (!canAudit) return
    const query = isClient
      ? '?audit=1&mes=' + encodeURIComponent(selectedMonth)
      : '?audit=1'
    const data = await api('/api/retrabalhos' + query)
    setAudits(data.data || [])
  }

  function openPrices() {
    if (!canViewPrices) return
    setSection('precos')
    setMobileOpen(false)
  }

  function openReworks() {
    setSection('lancamentos')
    setMobileOpen(false)
  }

  function toggleSidebar() {
    setCollapsed(current => {
      const next = !current
      // Na faixa compacta a expansão é temporária e não sobrescreve a preferência de desktop.
      if (!window.matchMedia(COMPACT_QUERY).matches) writeSidebarPref(next)
      return next
    })
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

  async function cancelCharge() {
    if (!cancelTarget || saving) return
    const motivo = cancelReason.trim()
    if (!motivo) {
      setCancelError('Informe o motivo do cancelamento da cobrança.')
      return
    }

    setSaving(true)
    setCancelError('')
    try {
      const result = await api('/api/retrabalhos', {
        method: 'PATCH',
        body: JSON.stringify({
          id: cancelTarget.id,
          versao: cancelTarget.versao,
          motivo,
        }),
      })

      const updated = result.data as Rework
      setItems(current => current.map(item => item.id === updated.id ? updated : item))
      setCancelTarget(null)
      setCancelReason('')
      await reloadAudit()
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : 'Falha ao cancelar cobrança.')
    } finally {
      setSaving(false)
    }
  }

  function exportReworks() {
    const label = isClient ? selectedMonth : (reworkMonth || 'completo')
    downloadCsv(
      `retrabalho-unilog-${label}.csv`,
      [
        'Data efetivação',
        'SKU',
        'Descrição',
        'Cliente',
        'Filial',
        'CNPJ',
        'Qtd retrabalhada',
        'Etiquetas Nacionalização',
        'Etiquetas RFID/ADIPAC',
        'Tarifa Nacionalização',
        'Tarifa RFID/ADIPAC',
        'Valor Nacionalização',
        'Valor RFID/ADIPAC',
        'Valor original cobrança',
        'Valor efetivo cobrança',
        'Cobrança cancelada',
        'Cancelado em',
        'Cancelado por',
        'Motivo cancelamento',
        'ID preço',
        'Criado por',
        'Criado em',
        'Atualizado por',
        'Atualizado em',
        'Versão',
      ],
      visibleItems.map(item => [
        item.dataEfetivacao,
        item.sku,
        item.descricao,
        item.nomeCliente,
        item.filial,
        cnpjLabel(item.cnpjCliente),
        item.quantidade,
        item.nacionalizacao,
        item.rfid,
        item.precoNacionalizacaoUnit.toFixed(4).replace('.', ','),
        item.precoRfidAdicionalUnit.toFixed(4).replace('.', ','),
        item.valorNacionalizacao.toFixed(4).replace('.', ','),
        item.valorRfidAdicional.toFixed(4).replace('.', ','),
        item.valorTotalCobranca.toFixed(4).replace('.', ','),
        item.valorCobrancaEfetiva.toFixed(4).replace('.', ','),
        item.cobrancaCancelada ? 'SIM' : 'NAO',
        item.canceladoEm || '',
        item.canceladoPor || '',
        item.motivoCancelamento || '',
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

  const effectiveClientBranchFilter = isClient && branches.length === 1
    ? branches[0].cnpj
    : clientBranchFilter

  const reworkMonths = useMemo(
    () => monthsOf(items.map(item => item.dataEfetivacao)),
    [items],
  )

  const visibleItems = useMemo(() => {
    if (!isClient) {
      return reworkMonth
        ? items.filter(item => item.dataEfetivacao.slice(0, 7) === reworkMonth)
        : items
    }
    const query = clientSearch.trim().toLowerCase()
    return items.filter(item => {
      if (effectiveClientBranchFilter && item.cnpjCliente !== effectiveClientBranchFilter) return false
      if (!query) return true
      return [
        item.sku,
        item.descricao,
        item.nomeCliente,
        item.filial,
        item.cnpjCliente,
      ].some(value => String(value || '').toLowerCase().includes(query))
    })
  }, [items, isClient, reworkMonth, effectiveClientBranchFilter, clientSearch])

  const totals = useMemo(() => ({
    registros: visibleItems.length,
    unidades: visibleItems.reduce((a, b) => a + Number(b.quantidade || 0), 0),
    etiquetas: visibleItems.reduce((a, b) => a + Number(b.totalEtiquetas || 0), 0),
    valor: visibleItems.reduce((a, b) => a + Number(b.valorCobrancaEfetiva || 0), 0),
  }), [visibleItems])

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

  const laborMonths = useMemo(() => monthsOf(labor.map(row => row.data)), [labor])

  function monthOptions(available: string[], selected: string) {
    const list = selected && !available.includes(selected) ? [selected, ...available] : available
    return [
      { label: 'Todos os meses', value: '' },
      ...list.map(month => ({ label: monthLabel(month), value: month })),
    ]
  }

  const visibleLabor = useMemo(
    () => laborMonth ? labor.filter(row => row.data.slice(0, 7) === laborMonth) : labor,
    [labor, laborMonth],
  )

  const laborTotals = useMemo(() => {
    const dias: Record<string, true> = {}
    visibleLabor.forEach(row => { dias[row.data] = true })
    return {
      dias: Object.keys(dias).length,
      casa: visibleLabor.reduce((a, b) => a + Number(b.qtdCasa || 0), 0),
      terceiros: visibleLabor.reduce((a, b) => a + Number(b.qtdTerceiros || 0), 0),
      total: visibleLabor.reduce((a, b) => a + Number(b.qtdTotal || 0), 0),
    }
  }, [visibleLabor])

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
            <span className="login-overline">ACESSO À PLATAFORMA</span>
            <h2>Bem-vindo de volta</h2>
            <p>Entre com a matrícula cadastrada pela administração.</p>

            <label htmlFor="login-matricula">Matrícula</label>
            <span className="p-input-icon-left login-field-icon">
              <i className="pi pi-user" />
              <InputText
                id="login-matricula"
                value={matricula}
                onChange={e => setMatricula(e.target.value)}
                autoComplete="username"
                placeholder="Digite sua matrícula"
                required
                disabled={authLoading}
              />
            </span>

            <label htmlFor="login-senha">Senha</label>
            <Password
              inputId="login-senha"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              feedback={false}
              toggleMask
              autoComplete="current-password"
              placeholder="Digite sua senha"
              required
              disabled={authLoading}
              className="login-password"
              inputClassName="login-password-input"
            />

            {authError && (
              <div className="error">
                <i className="pi pi-exclamation-circle" />{authError}
              </div>
            )}

            <Button
              label={authLoading ? 'Entrando…' : 'Entrar'}
              icon={authLoading ? 'pi pi-spin pi-spinner' : 'pi pi-arrow-right'}
              iconPos="right"
              className="primary"
              disabled={authLoading}
            />

            <div className="login-security-note">
              <i className="pi pi-info-circle" />
              <span>O acesso respeita o perfil cadastrado e todas as alterações relevantes permanecem auditáveis.</span>
            </div>
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
              className="login-password"
              inputClassName="login-password-input"
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
              className="login-password"
              inputClassName="login-password-input"
            />

            <div className="password-rules" aria-live="polite">
              <span className={newPassword.length >= 8 ? 'is-valid' : ''}>
                <i className={newPassword.length >= 8 ? 'pi pi-check-circle' : 'pi pi-circle'} />
                Pelo menos 8 caracteres
              </span>
              <span className={newPassword.length > 0 && newPassword === confirmPassword ? 'is-valid' : ''}>
                <i className={newPassword.length > 0 && newPassword === confirmPassword ? 'pi pi-check-circle' : 'pi pi-circle'} />
                As duas senhas devem coincidir
              </span>
            </div>

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

  if (workspaceLoading || !workspaceReady) {
    return (
      <main className="workspace-gate">
        <section className="workspace-gate-card" aria-live="polite">
          <img src="/brand/unilog-logo-white-transparent.svg" alt="Unilog Express" />
          {workspaceError ? (
            <>
              <i className="pi pi-exclamation-triangle workspace-gate-error-icon" />
              <h2>Não foi possível carregar o ambiente</h2>
              <p>{workspaceError}</p>
              <Button
                label="Tentar novamente"
                icon="pi pi-refresh"
                className="primary"
                onClick={() => void initializeWorkspace(user)}
              />
            </>
          ) : (
            <>
              <i className="pi pi-spin pi-spinner workspace-gate-spinner" />
              <h2>Preparando seu ambiente</h2>
              <p>Conectando à base e organizando os dados do seu escopo.</p>
              {workspaceSlow && (
                <small>A conexão com a base está levando mais tempo que o normal. Aguarde mais alguns segundos.</small>
              )}
            </>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className={`app ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`} aria-label="Navegação principal">
        <div className="sidebar-brand">
          <img src="/brand/unilog-logo-white-transparent.svg" alt="Unilog Express" />
          <button
            type="button"
            className="sidebar-collapse"
            onClick={toggleSidebar}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          >
            <i className={collapsed ? 'pi pi-angle-right' : 'pi pi-angle-left'} />
          </button>
          <button
            type="button"
            className="sidebar-mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <i className="pi pi-times" />
          </button>
        </div>

        <nav>
          <button className={`nav ${section === 'lancamentos' ? 'active' : ''}`} onClick={openReworks} title={collapsed ? (isClient ? 'Acompanhamento' : 'Lançamentos') : undefined}>
            <i className="pi pi-clipboard" />
            <span className="nav-label">{isClient ? 'Acompanhamento' : 'Lançamentos'}</span>
          </button>
          {canLabor && (
            <button className={`nav ${section === 'maoDeObra' ? 'active' : ''}`} onClick={openLabor} title={collapsed ? 'Mão de obra' : undefined}>
              <i className="pi pi-id-card" />
              <span className="nav-label">Mão de obra</span>
            </button>
          )}
          {canAudit && (
            <button className={`nav ${section === 'auditoria' ? 'active' : ''}`} onClick={openAudit} title={collapsed ? 'Auditoria' : undefined}>
              <i className="pi pi-history" />
              <span className="nav-label">Auditoria</span>
            </button>
          )}
          {canViewPrices && (
            <button className={`nav ${section === 'precos' ? 'active' : ''}`} onClick={openPrices} title={collapsed ? 'Preços' : undefined}>
              <i className="pi pi-dollar" />
              <span className="nav-label">Preços</span>
            </button>
          )}
          {canUsers && (
            <div className="nav-section">
              <span className="nav-caption">ADMINISTRAÇÃO</span>
              <button className={`nav ${section === 'usuarios' ? 'active' : ''}`} onClick={openUsers} title={collapsed ? 'Usuários' : undefined}>
                <i className="pi pi-users" />
                <span className="nav-label">Usuários</span>
              </button>
            </div>
          )}
        </nav>

        <div className="user-card">
          <div className="avatar">{user.nome.slice(0, 1).toUpperCase()}</div>
          <div className="user-copy">
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
          <div className="topbar-title">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <i className="pi pi-bars" />
            </button>
            <div>
              <small>RETRABALHO CONTROLE</small>
              <h1>
                {section === 'auditoria'
                  ? 'Auditoria'
                  : section === 'maoDeObra'
                    ? 'Controle de mão de obra'
                  : section === 'precos'
                    ? 'Tabela de preços'
                    : section === 'usuarios'
                      ? 'Usuários'
                      : isClient
                        ? 'Acompanhamento mensal'
                        : 'Retrabalho'}
              </h1>
            </div>
          </div>

          <div className="topbar-right">
            <span
              className={`base-sync ${baseConnected ? 'connected' : 'disconnected'}`}
              title={apiVersion ? `API ${apiVersion}` : undefined}
            >
              <span className="sync-dot" />
              <span>{baseConnected ? 'Base conectada' : 'Base indisponível'}</span>
            </span>
            <div className="topbar-actions">
            {isClient && (section === 'lancamentos' || section === 'auditoria') && (
              <label className="month-control">
                <span>Competência</span>
                <Dropdown
                  aria-label="Competência"
                  value={selectedMonth}
                  options={(months.length ? months : [selectedMonth]).map(month => ({
                    label: monthLabel(month),
                    value: month,
                  }))}
                  optionLabel="label"
                  optionValue="value"
                  onChange={e => void changeMonth(String(e.value ?? ''))}
                  disabled={loading}
                />
              </label>
            )}
            {section === 'lancamentos' && canExport && (
              <Button
                label={isClient ? 'Baixar CSV' : 'Exportar'}
                icon={isClient ? 'pi pi-file-export' : 'pi pi-download'}
                outlined
                className={isClient ? 'compact client-export' : 'compact'}
                onClick={exportReworks}
                disabled={!visibleItems.length}
              />
            )}
            {section === 'lancamentos' && canCreate && (
              <Button label="Novo lançamento" icon="pi pi-plus" className="primary compact" onClick={openNew} disabled={!branches.length} />
            )}
            {section === 'maoDeObra' && canExport && (
              <Button label="Exportar" icon="pi pi-download" outlined className="compact" onClick={exportLabor} disabled={!visibleLabor.length} />
            )}
            {section === 'maoDeObra' && canLabor && (
              <Button label="Novo lançamento" icon="pi pi-plus" className="primary compact" onClick={openNewLabor} disabled={!branches.length} />
            )}
            {section === 'auditoria' && canExport && (
              <Button label="Exportar auditoria" icon="pi pi-download" outlined className="compact" onClick={exportAudits} disabled={!audits.length} />
            )}
            </div>
          </div>
        </header>

        <div className="workspace-body">
        {section === 'lancamentos' && (
          <>
            {isClient && (
              <div className={`client-dashboard-filters ${branches.length <= 1 ? 'single-filter' : ''}`}>
                {branches.length > 1 && (
                  <label>
                    <span>Filial / CNPJ</span>
                    <Dropdown
                      aria-label="Filial / CNPJ"
                      value={clientBranchFilter}
                      options={[
                        { label: 'Todas as filiais', value: '' },
                        ...branches.map(branch => ({ label: branchLabel(branch), value: branch.cnpj })),
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      onChange={e => setClientBranchFilter(String(e.value ?? ''))}
                    />
                  </label>
                )}
                <label className="client-search">
                  <span>Buscar lançamento</span>
                  <InputText
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder={branches.length === 1 ? 'SKU ou descrição' : 'SKU, descrição, filial ou CNPJ'}
                  />
                </label>
              </div>
            )}
            {workspaceReady && canCreate && !branches.length && (
              <div className="branch-warning">
                <i className="pi pi-info-circle" />
                <span>Nenhuma filial ativa está disponível para o seu usuário. Cadastre/vincule uma filial antes de criar lançamentos.</span>
              </div>
            )}
            <div className="metrics metrics-4">
              <article><i className="pi pi-list" /><div><span>Registros</span><strong>{totals.registros}</strong></div></article>
              <article><i className="pi pi-box" /><div><span>Unidades retrabalhadas</span><strong>{totals.unidades.toLocaleString('pt-BR')}</strong></div></article>
              <article><i className="pi pi-tags" /><div><span>Etiquetas aplicadas</span><strong>{totals.etiquetas.toLocaleString('pt-BR')}</strong></div></article>
              <article><i className="pi pi-wallet" /><div><span>Valor a cobrar</span><strong>{money(totals.valor)}</strong></div></article>
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <small className="panel-eyebrow">CONTROLE OPERACIONAL</small>
                  <h2>{isClient ? 'Detalhamento da competência' : 'Histórico de retrabalho'}</h2>
                  <p>{isClient
                    ? `Consulta somente leitura · ${monthLabel(selectedMonth)}`
                    : reworkMonth
                      ? `Registros, etiquetas e cobrança · ${monthLabel(reworkMonth)}`
                      : 'Registros, quantidades, etiquetas aplicadas e cobrança histórica.'}</p>
                </div>
                <div className="labor-head-actions">
                  {!isClient && (
                    <Dropdown
                      aria-label="Mês"
                      value={reworkMonth}
                      options={monthOptions(reworkMonths, reworkMonth)}
                      optionLabel="label"
                      optionValue="value"
                      onChange={e => setReworkMonth(String(e.value ?? ''))}
                    />
                  )}
                  <Button icon="pi pi-refresh" text rounded onClick={() => void loadItems(isClient ? selectedMonth : undefined)} loading={loading} />
                </div>
              </div>
              <DataTable className="mobile-record-table rework-record-table" value={visibleItems} loading={loading} paginator rows={15} dataKey="id" emptyMessage="Nenhum retrabalho registrado para o período." onRowDoubleClick={e => openEdit(e.data as Rework)} stripedRows scrollable>
                <Column field="dataEfetivacao" header="Data" body={(row: Rework) => dateLabel(row.dataEfetivacao)} />
                <Column field="sku" header="SKU" />
                <Column field="descricao" header="Descrição" />
                <Column field="nomeCliente" header="Cliente" />
                <Column field="filial" header="Filial" />
                <Column field="cnpjCliente" header="CNPJ" body={(row: Rework) => cnpjLabel(row.cnpjCliente)} />
                <Column field="quantidade" header="Qtd." body={(row: Rework) => intLabel(row.quantidade)} />
                <Column field="nacionalizacao" header="Nacionalização" body={(row: Rework) => intLabel(row.nacionalizacao)} />
                <Column field="rfid" header="RFID/ADIPAC" body={(row: Rework) => intLabel(row.rfid)} />
                <Column
                  field="valorCobrancaEfetiva"
                  header="Cobrança"
                  body={(row: Rework) => row.cobrancaCancelada
                    ? <Tag severity="danger" value="CANCELADA" />
                    : money(row.valorCobrancaEfetiva)}
                />
                <Column field="matriculaCriacao" header="Criado por" />
                <Column
                  header=""
                  body={(row: Rework) => canEdit ? (
                    <div className="row-actions">
                      <Button icon="pi pi-pencil" text rounded className="table-action" disabled={row.cobrancaCancelada} onClick={() => openEdit(row)} />
                      <Button
                        icon="pi pi-ban"
                        text
                        rounded
                        className="table-action danger-action"
                        disabled={row.cobrancaCancelada}
                        title={row.cobrancaCancelada ? 'Cobrança já cancelada' : 'Cancelar cobrança'}
                        onClick={() => { setCancelError(''); setCancelReason(''); setCancelTarget(row) }}
                      />
                    </div>
                  ) : null}
                />
              </DataTable>
            </section>
          </>
        )}

        {section === 'maoDeObra' && canLabor && (
          <>
            <div className="metrics metrics-4">
              <article><i className="pi pi-calendar" /><div><span>Dias lançados</span><strong>{laborTotals.dias}</strong></div></article>
              <article><i className="pi pi-user" /><div><span>Mão de obra da casa</span><strong>{laborTotals.casa.toLocaleString('pt-BR')}</strong></div></article>
              <article><i className="pi pi-users" /><div><span>Terceiros</span><strong>{laborTotals.terceiros.toLocaleString('pt-BR')}</strong></div></article>
              <article><i className="pi pi-chart-bar" /><div><span>Total de pessoas</span><strong>{laborTotals.total.toLocaleString('pt-BR')}</strong></div></article>
            </div>

            <section className="panel">
              <div className="panel-head">
                <div>
                  <small className="panel-eyebrow">CONTROLE OPERACIONAL</small>
                  <h2>Mão de obra por dia</h2>
                  <p>Quantidade diária de mão de obra da casa e de terceiros, por filial.</p>
                </div>
                <div className="labor-head-actions">
                  <Dropdown
                    aria-label="Mês"
                    value={laborMonth}
                    options={monthOptions(laborMonths, laborMonth)}
                    optionLabel="label"
                    optionValue="value"
                    onChange={e => setLaborMonth(String(e.value ?? ''))}
                  />
                  <Button icon="pi pi-refresh" text rounded onClick={() => void loadLabor()} loading={laborLoading} />
                </div>
              </div>
              <DataTable className="mobile-record-table labor-record-table" value={visibleLabor} loading={laborLoading} paginator rows={15} dataKey="id" emptyMessage="Nenhum lançamento de mão de obra para o período." onRowDoubleClick={e => openEditLabor(e.data as LaborRow)} stripedRows scrollable>
                <Column field="data" header="Data" body={(row: LaborRow) => dateLabel(row.data)} />
                <Column field="nomeCliente" header="Cliente" />
                <Column field="filial" header="Filial" />
                <Column field="qtdCasa" header="Casa" body={(row: LaborRow) => intLabel(row.qtdCasa)} />
                <Column field="qtdTerceiros" header="Terceiros" body={(row: LaborRow) => intLabel(row.qtdTerceiros)} />
                <Column field="qtdTotal" header="Total" body={(row: LaborRow) => intLabel(row.qtdTotal)} />
                <Column field="observacao" header="Observação" />
                <Column field="matriculaCriacao" header="Criado por" />
                <Column
                  header=""
                  body={(row: LaborRow) => canEdit ? (
                    <div className="row-actions">
                      <Button icon="pi pi-pencil" text rounded className="table-action" title="Editar" onClick={() => openEditLabor(row)} />
                    </div>
                  ) : null}
                />
              </DataTable>
            </section>
          </>
        )}

        {section === 'auditoria' && (
          <section className="panel workspace-page">
            <div className="panel-head">
              <div>
                <small className="panel-eyebrow">GOVERNANÇA</small>
                <h2>Histórico de auditoria</h2>
                <p>{isClient ? `Eventos vinculados à competência ${monthLabel(selectedMonth)}.` : 'Alterações relevantes registradas com autor, versão e estado anterior/posterior.'}</p>
              </div>
              <Button icon="pi pi-refresh" text rounded onClick={() => void reloadAudit()} />
            </div>
            <div className="page-table">
              <DataTable className="mobile-record-table audit-record-table" value={audits} paginator rows={20} scrollable dataKey="idAuditoria" emptyMessage="Nenhum evento de auditoria encontrado.">
                <Column field="dataHora" header="Data/hora" />
                <Column field="entidade" header="Entidade" />
                <Column field="idRegistro" header="Registro" />
                <Column field="acao" header="Ação" />
                <Column field="matriculaAutor" header="Autor" />
                <Column field="versaoAnterior" header="Versão anterior" />
                <Column field="versaoNova" header="Versão nova" />
                <Column header="" body={(r: AuditRow) => <Button icon="pi pi-search" text rounded title="Ver detalhes" onClick={() => setSelectedAudit(r)} />} />
              </DataTable>
            </div>
          </section>
        )}

        {section === 'precos' && (
          <section className="panel workspace-page">
            <div className="panel-head">
              <div>
                <small className="panel-eyebrow">PRECIFICAÇÃO</small>
                <h2>Tabela de preços</h2>
                <p>Vigências preservam o histórico financeiro dos lançamentos já efetivados.</p>
              </div>
              <Button icon="pi pi-refresh" text rounded onClick={() => void loadPrices()} />
            </div>
            <div className="page-body">
              {canManagePrices && (
                <div className="price-create">
                  <label>Nova vigência<Calendar value={priceForm.vigenciaInicio} onChange={e => setPriceForm({ ...priceForm, vigenciaInicio: e.value as Date })} dateFormat="dd/mm/yy" /></label>
                  <label>Nacionalização<InputNumber value={priceForm.valorNacionalizacao} onValueChange={e => setPriceForm({ ...priceForm, valorNacionalizacao: e.value || 0 })} mode="currency" currency="BRL" locale="pt-BR" min={0} minFractionDigits={4} maxFractionDigits={4} /></label>
                  <label>RFID/ADIPAC<InputNumber value={priceForm.valorRfidAdicional} onValueChange={e => setPriceForm({ ...priceForm, valorRfidAdicional: e.value || 0 })} mode="currency" currency="BRL" locale="pt-BR" min={0} minFractionDigits={4} maxFractionDigits={4} /></label>
                  <label className="price-observation">Observação<InputText value={priceForm.observacao} onChange={e => setPriceForm({ ...priceForm, observacao: e.target.value })} placeholder="Motivo ou referência da alteração" /></label>
                  <Button label="Criar vigência" icon="pi pi-plus" className="primary" loading={saving} onClick={createPrice} />
                </div>
              )}
              <div className="price-rule"><strong>Regra de cobrança:</strong> Nacionalização = R$ 0,4100; RFID/ADIPAC = R$ 0,1900 por unidade (RFID, ADIPAC ou os dois); Nacionalização + RFID/ADIPAC = R$ 0,6000. Os itens são opcionais e podem ser lançados separadamente. As tarifas são mantidas com 4 casas decimais.</div>
              <DataTable className="mobile-record-table price-record-table" value={prices} paginator rows={10} dataKey="id" emptyMessage="Nenhuma vigência cadastrada.">
                <Column field="vigenciaInicio" header="Início" body={(r: PriceRow) => dateLabel(r.vigenciaInicio)} />
                <Column field="vigenciaFim" header="Fim" body={(r: PriceRow) => r.vigenciaFim ? dateLabel(r.vigenciaFim) : 'Vigente'} />
                <Column field="valorNacionalizacao" header="Nacionalização" body={(r: PriceRow) => rateMoney(r.valorNacionalizacao)} />
                <Column field="valorRfidAdicional" header="RFID/ADIPAC" body={(r: PriceRow) => rateMoney(r.valorRfidAdicional)} />
                <Column field="observacao" header="Observação" />
                <Column field="criadoPor" header="Criado por" />
              </DataTable>
            </div>
          </section>
        )}

        {section === 'usuarios' && canUsers && (
          <section className="panel workspace-page">
            <div className="panel-head">
              <div>
                <small className="panel-eyebrow">ADMINISTRAÇÃO</small>
                <h2>Controle de usuários</h2>
                <p>Criação, perfil, status e primeiro acesso por matrícula.</p>
              </div>
              <Button icon="pi pi-refresh" text rounded onClick={() => void reloadUsers()} />
            </div>
            <div className="page-body">
              <div className="user-form">
                <label>
                  Matrícula
                  <InputText
                    placeholder="Ex.: 358038"
                    value={newUser.matricula}
                    onChange={e => setNewUser({ ...newUser, matricula: e.target.value })}
                  />
                </label>
                <label>
                  Nome
                  <InputText
                    placeholder="Nome do usuário"
                    value={newUser.nome}
                    onChange={e => setNewUser({ ...newUser, nome: e.target.value })}
                  />
                </label>
                <label>
                  Perfil
                  <Dropdown
                    aria-label="Perfil"
                    value={newUser.perfil}
                    options={PROFILE_OPTIONS}
                    optionLabel="label"
                    optionValue="value"
                    onChange={e => setNewUser({ ...newUser, perfil: e.value as Profile })}
                  />
                </label>
                <label>
                  Senha temporária
                  <InputText
                    placeholder="Mínimo de 8 caracteres"
                    type="password"
                    value={newUser.senhaTemporaria}
                    onChange={e => setNewUser({ ...newUser, senhaTemporaria: e.target.value })}
                  />
                </label>
                <label className="user-branches-field">
                  Filiais / CNPJs
                  <MultiSelect
                    value={newUser.cnpjs}
                    options={allBranches.map(branch => ({ label: branchLabel(branch), value: branch.cnpj }))}
                    onChange={e => setNewUser({ ...newUser, cnpjs: e.value || [] })}
                    placeholder={newUser.perfil === 'ADMIN' ? 'Vazio = todas as filiais' : 'Selecione uma ou mais filiais'}
                    display="chip"
                    filter
                  />
                </label>
                <Button label="Criar usuário" icon="pi pi-plus" onClick={createUser} loading={saving} className="primary form-submit user-submit" />
              </div>
              {userError && (
                <div className="error user-error">
                  <i className="pi pi-exclamation-circle" />{userError}
                </div>
              )}
              <DataTable className="mobile-record-table users-record-table" value={users} rows={15} paginator dataKey="matricula">
                <Column field="matricula" header="Matrícula" />
                <Column field="nome" header="Nome" />
                <Column field="perfil" header="Perfil" body={(r: ManagedUser) => <Tag value={r.perfil} />} />
                <Column field="ativo" header="Ativo" body={(r: ManagedUser) => <Tag severity={r.ativo === 'SIM' ? 'success' : 'secondary'} value={r.ativo} />} />
                <Column field="trocaSenhaObrigatoria" header="Troca pendente" />
                <Column
                  header="Filiais"
                  body={(r: ManagedUser) => r.cnpjs?.length ? `${r.cnpjs.length} vinculada(s)` : r.perfil === 'ADMIN' ? 'Todas' : 'Nenhuma'}
                />
                <Column header="" body={(r: ManagedUser) => <Button icon="pi pi-pencil" text rounded onClick={() => { setUserError(''); setEditingUser({ ...r }) }} />} />
              </DataTable>
            </div>
          </section>
        )}
        </div>
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
          <label className="span-2">
            Cliente / filial
            <Dropdown
              aria-label="Cliente / filial"
              value={form.cnpjCliente}
              options={branches.map(branch => ({ label: branchLabel(branch), value: branch.cnpj }))}
              optionLabel="label"
              optionValue="value"
              placeholder="Selecione a filial"
              onChange={e => setForm({ ...form, cnpjCliente: String(e.value ?? '') })}
              required
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
              onValueChange={e => setForm({ ...form, quantidade: e.value ?? null })}
              placeholder="0"
              min={1}
              locale="pt-BR"
              maxFractionDigits={0}
            />
          </label>
          <label>
            Etiquetas nacionalização
            <InputNumber
              value={form.nacionalizacao}
              onValueChange={e => setForm({ ...form, nacionalizacao: e.value ?? null })}
              placeholder="0"
              min={0}
              locale="pt-BR"
              maxFractionDigits={0}
            />
          </label>
          <label>
            Etiquetas RFID/ADIPAC
            <InputNumber
              value={form.rfid}
              onValueChange={e => setForm({ ...form, rfid: e.value ?? null })}
              placeholder="0"
              min={0}
              locale="pt-BR"
              maxFractionDigits={0}
            />
          </label>
          <p className="form-hint span-2">
            Nacionalização e RFID/ADIPAC são opcionais: lance um, outro ou os dois.
            Para RFID/ADIPAC, informe as unidades — usar RFID, ADIPAC ou ambos na mesma unidade é cobrado uma única vez.
          </p>
        </div>

        <div className="billing-preview">
          <div>
            <span>Nacionalização</span>
            <strong>{previewPrice ? money(previewPrice.nat) : 'Sem vigência'}</strong>
            <small>
              {previewPrice
                ? `${intLabel(form.nacionalizacao)} × ${rateMoney(previewPrice.price.valorNacionalizacao)}`
                : 'Cadastre uma tabela válida para a data.'}
            </small>
          </div>
          <div>
            <span>RFID/ADIPAC</span>
            <strong>{previewPrice ? money(previewPrice.rfid) : '—'}</strong>
            <small>
              {previewPrice
                ? `${intLabel(form.rfid)} × ${rateMoney(previewPrice.price.valorRfidAdicional)}`
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
        {formError && <div className="error"><i className="pi pi-exclamation-circle" />{formError}</div>}
      </Dialog>

      <Dialog
        header={laborForm.id ? 'Editar mão de obra' : 'Lançar mão de obra'}
        visible={laborDialog}
        onHide={() => !saving && setLaborDialog(false)}
        style={{ width: 'min(620px, 96vw)' }}
      >
        <div className="form-grid">
          <label>
            Data
            <Calendar
              value={laborForm.data}
              onChange={e => setLaborForm({ ...laborForm, data: e.value as Date })}
              dateFormat="dd/mm/yy"
            />
          </label>
          <label>
            Cliente / filial
            <Dropdown
              aria-label="Cliente / filial"
              value={laborForm.cnpjCliente}
              options={branches.map(branch => ({ label: branchLabel(branch), value: branch.cnpj }))}
              optionLabel="label"
              optionValue="value"
              placeholder="Selecione a filial"
              onChange={e => setLaborForm({ ...laborForm, cnpjCliente: String(e.value ?? '') })}
            />
          </label>
          <label>
            Mão de obra da casa
            <InputNumber
              value={laborForm.qtdCasa}
              onValueChange={e => setLaborForm({ ...laborForm, qtdCasa: e.value ?? null })}
              placeholder="0"
              min={0}
              locale="pt-BR"
              maxFractionDigits={0}
            />
          </label>
          <label>
            Terceiros
            <InputNumber
              value={laborForm.qtdTerceiros}
              onValueChange={e => setLaborForm({ ...laborForm, qtdTerceiros: e.value ?? null })}
              placeholder="0"
              min={0}
              locale="pt-BR"
              maxFractionDigits={0}
            />
          </label>
          <label className="span-2">
            Observação (opcional)
            <InputText
              value={laborForm.observacao}
              onChange={e => setLaborForm({ ...laborForm, observacao: e.target.value })}
              placeholder="Ex.: reforço para inventário"
            />
          </label>
        </div>

        <div className="labor-preview">
          <span>Total do dia</span>
          <strong>{(Number(laborForm.qtdCasa || 0) + Number(laborForm.qtdTerceiros || 0)).toLocaleString('pt-BR')} pessoa(s)</strong>
        </div>

        <div className="dialog-actions">
          <Button label="Cancelar" text disabled={saving} onClick={() => setLaborDialog(false)} />
          <Button label="Salvar" icon="pi pi-check" className="primary" loading={saving} onClick={saveLabor} />
        </div>
        {laborError && <div className="error"><i className="pi pi-exclamation-circle" />{laborError}</div>}
      </Dialog>

      <Dialog
        header="Cancelar cobrança"
        visible={Boolean(cancelTarget)}
        onHide={() => !saving && setCancelTarget(null)}
        style={{ width: 'min(520px, 94vw)' }}
      >
        {cancelTarget && (
          <div className="cancel-charge">
            <div className="cancel-summary">
              <span>Registro</span>
              <strong>{cancelTarget.id}</strong>
              <span>Valor original</span>
              <strong>{money(cancelTarget.valorTotalCobranca)}</strong>
            </div>
            <p>O retrabalho continuará no histórico. Apenas a cobrança deixará de compor os totais financeiros.</p>
            <label>
              Motivo do cancelamento
              <InputText
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ex.: lançamento duplicado"
                autoFocus
              />
            </label>
            {cancelError && <div className="error"><i className="pi pi-exclamation-circle" />{cancelError}</div>}
          </div>
        )}
        <div className="dialog-actions">
          <Button label="Voltar" text disabled={saving} onClick={() => setCancelTarget(null)} />
          <Button label="Cancelar cobrança" icon="pi pi-ban" severity="danger" loading={saving} onClick={cancelCharge} />
        </div>
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
              <Dropdown
                aria-label="Perfil"
                value={editingUser.perfil}
                options={PROFILE_OPTIONS}
                optionLabel="label"
                optionValue="value"
                onChange={e => setEditingUser({ ...editingUser, perfil: e.value as Profile })}
              />
            </label>
            <label>
              Status
              <Dropdown
                aria-label="Status"
                value={editingUser.ativo}
                options={USER_STATUS_OPTIONS}
                optionLabel="label"
                optionValue="value"
                onChange={e => setEditingUser({
                  ...editingUser,
                  ativo: e.value as 'SIM' | 'NAO',
                })}
              />
            </label>
            <label>
              Filiais / CNPJs
              <MultiSelect
                value={editingUser.cnpjs || []}
                options={allBranches.map(branch => ({ label: branchLabel(branch), value: branch.cnpj }))}
                onChange={e => setEditingUser({ ...editingUser, cnpjs: e.value || [] })}
                placeholder={editingUser.perfil === 'ADMIN' ? 'Vazio = todas as filiais' : 'Selecione uma ou mais filiais'}
                display="chip"
                filter
              />
            </label>
          </div>
        )}

        {userError && (
          <div className="error user-error">
            <i className="pi pi-exclamation-circle" />{userError}
          </div>
        )}

        <div className="dialog-actions">
          <Button label="Cancelar" text disabled={saving} onClick={() => { setEditingUser(null); setUserError('') }} />
          <Button label="Salvar" className="primary" loading={saving} onClick={updateUser} />
        </div>
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
          <div className="password-rules" aria-live="polite">
            <span className={newPassword.length >= 8 ? 'is-valid' : ''}>
              <i className={newPassword.length >= 8 ? 'pi pi-check-circle' : 'pi pi-circle'} />
              Pelo menos 8 caracteres
            </span>
            <span className={newPassword.length > 0 && newPassword === confirmPassword ? 'is-valid' : ''}>
              <i className={newPassword.length > 0 && newPassword === confirmPassword ? 'pi pi-check-circle' : 'pi pi-circle'} />
              As duas senhas devem coincidir
            </span>
          </div>

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
