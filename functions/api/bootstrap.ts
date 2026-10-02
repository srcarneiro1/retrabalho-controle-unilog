import { readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv, type SessionIdentity } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

function identityPayload(user: SessionIdentity) {
  return {
    matriculaAutor: user.matricula,
    perfilAutor: user.perfil,
  }
}

async function legacyBootstrap(env: Env, user: SessionIdentity, mes = '') {
  const identity = identityPayload(user)
  const pricesPromise = readJson(env, 'precos', { acao:'LISTAR', ...identity })
  const branchesPromise = readJson(env, 'filiais', { acao:'LISTAR', ...identity })

  if (user.perfil === 'CLIENTE') {
    const monthsData = await readJson(env, 'retrabalhos', { acao:'MESES', ...identity })
    const months = Array.isArray(monthsData.data) ? monthsData.data : []
    const selectedMonth = mes || months[0] || new Date().toISOString().slice(0,7)

    const [prices, branches, items, audits] = await Promise.all([
      pricesPromise,
      branchesPromise,
      readJson(env, 'retrabalhos', { acao:'LISTAR', mes:selectedMonth, ...identity }),
      readJson(env, 'audit', { acao:'LISTAR', mes:selectedMonth, ...identity }),
    ])

    return {
      ok:true,
      connected:true,
      legacyBootstrap:true,
      apiVersion:'',
      prices:prices.data || [],
      branches:branches.data || [],
      items:items.data || [],
      audits:audits.data || [],
      months,
      selectedMonth,
      allBranches:[],
      users:[],
    }
  }

  const requests: Promise<any>[] = [
    pricesPromise,
    branchesPromise,
    readJson(env, 'retrabalhos', { acao:'LISTAR', mes:'', ...identity }),
  ]

  const includeAudit = user.perfil === 'SUPERVISOR' || user.perfil === 'ADMIN'
  const includeAdmin = user.perfil === 'ADMIN'
  if (includeAudit) requests.push(readJson(env, 'audit', { acao:'LISTAR', mes:'', ...identity }))
  if (includeAdmin) {
    requests.push(readJson(env, 'filiais', { acao:'LISTAR_TODAS', ...identity }))
    requests.push(readJson(env, 'usuarios', { acao:'LISTAR', ...identity }))
  }

  const result = await Promise.all(requests)
  let index = 0
  const prices = result[index++]
  const branches = result[index++]
  const items = result[index++]
  const audits = includeAudit ? result[index++] : { data:[] }
  const allBranches = includeAdmin ? result[index++] : { data:[] }
  const users = includeAdmin ? result[index++] : { data:[] }

  return {
    ok:true,
    connected:true,
    legacyBootstrap:true,
    apiVersion:'',
    prices:prices.data || [],
    branches:branches.data || [],
    items:items.data || [],
    audits:audits.data || [],
    months:[],
    selectedMonth:'',
    allBranches:allBranches.data || [],
    users:users.data || [],
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await authorize(request, env)
    if (!user) return json({ ok:false, error:{ message:'Sessão inválida.' } }, 401)
    if (user.trocaSenhaObrigatoria) {
      return json({ ok:false, error:{ message:'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
    }

    const url = new URL(request.url)
    const mes = String(url.searchParams.get('mes') || '').trim()
    const periodOnly = url.searchParams.get('period') === '1'

    if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
      return json({ ok:false, error:{ message:'Competência mensal inválida.' } }, 400)
    }

    try {
      return json(await readJson(env, 'bootstrap', {
        acao: periodOnly ? 'COMPETENCIA' : 'CARREGAR',
        mes,
        matriculaAutor: user.matricula,
        perfilAutor: user.perfil,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const canFallback = /rota|bootstrap|ação/i.test(message)
      if (!canFallback) throw error

      // Transitional safety: older Apps Script deployments continue to work
      // until BootstrapService.gs + Api.gs are published.
      return json(await legacyBootstrap(env, user, mes))
    }
  } catch (error) {
    return json({
      ok:false,
      error:{ message:error instanceof Error ? error.message : 'Falha ao preparar o ambiente.' }
    }, 502)
  }
}
