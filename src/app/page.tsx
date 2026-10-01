'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Calendar } from 'primereact/calendar'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Dialog } from 'primereact/dialog'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { Password } from 'primereact/password'
import { Tag } from 'primereact/tag'

type Profile = 'OPERACIONAL' | 'SUPERVISOR' | 'ADMIN'
type User = { matricula: string; nome: string; perfil: Profile; trocaSenhaObrigatoria?: boolean }
type Rework = {
  id: string
  dataEfetivacao: string
  sku: string
  descricao: string
  quantidade: number
  dataValidade: string
  nacionalizacao: number
  rfid: number
  totalEtiquetas: number
  matriculaCriacao: string
  criadoEm: string
  atualizadoEm?: string
  versao: number
}

const emptyForm = {
  id: '',
  dataEfetivacao: new Date(),
  sku: '',
  descricao: '',
  quantidade: 0,
  dataValidade: null as Date | null,
  nacionalizacao: 0,
  rfid: 0,
  versao: 0,
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [matricula, setMatricula] = useState('')
  const [senha, setSenha] = useState('')
  const [authError, setAuthError] = useState('')
  const [items, setItems] = useState<Rework[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [dialog, setDialog] = useState(false)
  const [usersDialog, setUsersDialog] = useState(false)
  const [auditDialog, setAuditDialog] = useState(false)
  const [audits, setAudits] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [newUser, setNewUser] = useState({ matricula: '', nome: '', perfil: 'OPERACIONAL' as Profile, senhaTemporaria: '' })
  const canEdit = user?.perfil === 'SUPERVISOR' || user?.perfil === 'ADMIN'
  const canUsers = user?.perfil === 'ADMIN'

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(path, { credentials: 'include', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.ok === false) throw new Error(data?.error?.message || 'Falha na operação.')
    return data
  }

  async function loadItems() {
    setLoading(true)
    try {
      const data = await api('/api/retrabalhos')
      setItems(data.data || [])
    } finally { setLoading(false) }
  }

  useEffect(() => {
    api('/api/auth/me').then(r => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoadingSession(false))
  }, [])

  useEffect(() => { if (user) void loadItems() }, [user])

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ matricula, senha }) })
      setUser(data.user)
      setSenha('')
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Falha no login.') }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => null)
    setUser(null)
  }

  function openNew() {
    setForm({ ...emptyForm, dataEfetivacao: new Date() })
    setDialog(true)
  }

  function openEdit(row: Rework) {
    if (!canEdit) return
    setForm({
      id: row.id,
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
    const payload = {
      id: form.id || undefined,
      dataEfetivacao: isoDate(form.dataEfetivacao),
      sku: form.sku.trim(),
      descricao: form.descricao.trim(),
      quantidade: form.quantidade,
      dataValidade: isoDate(form.dataValidade),
      nacionalizacao: form.nacionalizacao,
      rfid: form.rfid,
      versao: form.versao,
    }
    await api('/api/retrabalhos', { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
    setDialog(false)
    await loadItems()
  }

  async function openUsers() {
    const data = await api('/api/usuarios')
    setUsers(data.data || [])
    setUsersDialog(true)
  }

  async function createUser() {
    await api('/api/usuarios', { method: 'POST', body: JSON.stringify(newUser) })
    const data = await api('/api/usuarios')
    setUsers(data.data || [])
    setNewUser({ matricula: '', nome: '', perfil: 'OPERACIONAL', senhaTemporaria: '' })
  }

  async function openAudit() {
    const data = await api('/api/retrabalhos?audit=1')
    setAudits(data.data || [])
    setAuditDialog(true)
  }

  const totals = useMemo(() => ({
    registros: items.length,
    unidades: items.reduce((a, b) => a + Number(b.quantidade || 0), 0),
    etiquetas: items.reduce((a, b) => a + Number(b.totalEtiquetas || 0), 0),
  }), [items])

  if (loadingSession) return <div className="session-loading"><i className="pi pi-spin pi-spinner" /> Validando sessão...</div>

  if (!user) return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div><div className="brand">UNILOG</div><span>CONTROLE OPERACIONAL</span></div>
          <div><small>RETRABALHO</small><h1>Rastreabilidade de execução e etiquetagem.</h1><p>Registro controlado por matrícula, histórico de alterações e perfis de acesso.</p></div>
          <div className="proof"><span><i className="pi pi-shield" /> Sessão protegida</span><span><i className="pi pi-history" /> Auditoria</span></div>
        </div>
        <form className="login-form" onSubmit={login}>
          <small>ACESSO AO SISTEMA</small><h2>Entrar</h2><p>Use sua matrícula e senha.</p>
          <label>Matrícula</label><InputText value={matricula} onChange={e => setMatricula(e.target.value)} required />
          <label>Senha</label><Password value={senha} onChange={e => setSenha(e.target.value)} feedback={false} toggleMask required />
          {authError && <div className="error"><i className="pi pi-exclamation-circle" />{authError}</div>}
          <Button label="Acessar" icon="pi pi-sign-in" className="primary" />
        </form>
      </section>
    </main>
  )

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="sidebar-brand"><b>UNILOG</b><small>RETRABALHO</small></div>
        <nav>
          <button className="nav active"><i className="pi pi-clipboard" /> Lançamentos</button>
          {canEdit && <button className="nav" onClick={openAudit}><i className="pi pi-history" /> Auditoria</button>}
          {canUsers && <button className="nav" onClick={openUsers}><i className="pi pi-users" /> Usuários</button>}
        </nav>
        <div className="user-card">
          <div className="avatar">{user.nome.slice(0,2).toUpperCase()}</div>
          <div><strong>{user.nome}</strong><span>{user.matricula} · {user.perfil}</span></div>
          <button onClick={logout}><i className="pi pi-sign-out" /></button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar"><div><small>OPERAÇÃO / CONTROLE</small><h1>Retrabalho</h1></div><Button label="Novo lançamento" icon="pi pi-plus" className="primary compact" onClick={openNew} /></header>

        <div className="metrics">
          <article><i className="pi pi-list" /><div><span>Registros</span><strong>{totals.registros}</strong></div></article>
          <article><i className="pi pi-box" /><div><span>Unidades retrabalhadas</span><strong>{totals.unidades.toLocaleString('pt-BR')}</strong></div></article>
          <article><i className="pi pi-tags" /><div><span>Etiquetas aplicadas</span><strong>{totals.etiquetas.toLocaleString('pt-BR')}</strong></div></article>
        </div>

        <section className="panel">
          <div className="panel-head"><div><h2>Histórico de retrabalho</h2><p>Operacional inclui registros; Supervisor e Admin podem corrigir dados com auditoria.</p></div><Button icon="pi pi-refresh" text rounded onClick={loadItems} loading={loading} /></div>
          <DataTable value={items} loading={loading} paginator rows={15} dataKey="id" emptyMessage="Nenhum retrabalho registrado." onRowDoubleClick={e => openEdit(e.data)} stripedRows>
            <Column field="dataEfetivacao" header="Data" />
            <Column field="sku" header="SKU" />
            <Column field="descricao" header="Descrição" />
            <Column field="quantidade" header="Qtd." />
            <Column field="dataValidade" header="Validade" />
            <Column field="nacionalizacao" header="Nacionalização" />
            <Column field="rfid" header="RFID" />
            <Column field="totalEtiquetas" header="Total etiquetas" />
            <Column field="matriculaCriacao" header="Criado por" />
            <Column header="" body={row => canEdit ? <Button icon="pi pi-pencil" text rounded onClick={() => openEdit(row)} /> : null} />
          </DataTable>
        </section>
      </section>

      <Dialog header={form.id ? 'Editar retrabalho' : 'Novo retrabalho'} visible={dialog} onHide={() => setDialog(false)} style={{ width: 'min(760px, 96vw)' }}>
        <div className="form-grid">
          <label>Data de efetivação<Calendar value={form.dataEfetivacao} onChange={e => setForm({ ...form, dataEfetivacao: e.value as Date })} dateFormat="dd/mm/yy" /></label>
          <label>SKU<InputText value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></label>
          <label className="span-2">Descrição<InputText value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></label>
          <label>Quantidade retrabalhada<InputNumber value={form.quantidade} onValueChange={e => setForm({ ...form, quantidade: e.value || 0 })} min={1} /></label>
          <label>Validade inserida<Calendar value={form.dataValidade} onChange={e => setForm({ ...form, dataValidade: e.value as Date })} dateFormat="dd/mm/yy" showButtonBar /></label>
          <label>Etiquetas nacionalização<InputNumber value={form.nacionalizacao} onValueChange={e => setForm({ ...form, nacionalizacao: e.value || 0 })} min={0} /></label>
          <label>Etiquetas RFID<InputNumber value={form.rfid} onValueChange={e => setForm({ ...form, rfid: e.value || 0 })} min={0} /></label>
        </div>
        <div className="dialog-actions"><Button label="Cancelar" text onClick={() => setDialog(false)} /><Button label="Salvar" icon="pi pi-check" className="primary" onClick={save} /></div>
      </Dialog>

      <Dialog header="Usuários" visible={usersDialog} onHide={() => setUsersDialog(false)} maximizable style={{ width: 'min(1000px, 96vw)' }}>
        <div className="user-form">
          <InputText placeholder="Matrícula" value={newUser.matricula} onChange={e => setNewUser({ ...newUser, matricula: e.target.value })} />
          <InputText placeholder="Nome" value={newUser.nome} onChange={e => setNewUser({ ...newUser, nome: e.target.value })} />
          <select value={newUser.perfil} onChange={e => setNewUser({ ...newUser, perfil: e.target.value as Profile })}><option>OPERACIONAL</option><option>SUPERVISOR</option><option>ADMIN</option></select>
          <InputText placeholder="Senha temporária" value={newUser.senhaTemporaria} onChange={e => setNewUser({ ...newUser, senhaTemporaria: e.target.value })} />
          <Button label="Criar" onClick={createUser} className="primary" />
        </div>
        <DataTable value={users} rows={15} paginator>
          <Column field="matricula" header="Matrícula" /><Column field="nome" header="Nome" /><Column field="perfil" header="Perfil" body={r => <Tag value={r.perfil} />} /><Column field="ativo" header="Ativo" />
        </DataTable>
      </Dialog>

      <Dialog header="Auditoria" visible={auditDialog} onHide={() => setAuditDialog(false)} maximizable style={{ width: 'min(1200px, 96vw)' }}>
        <DataTable value={audits} paginator rows={20} scrollable>
          <Column field="dataHora" header="Data/hora" /><Column field="entidade" header="Entidade" /><Column field="idRegistro" header="Registro" /><Column field="acao" header="Ação" /><Column field="matriculaAutor" header="Autor" /><Column field="versaoAnterior" header="Versão anterior" /><Column field="versaoNova" header="Versão nova" />
        </DataTable>
      </Dialog>
    </main>
  )
}
