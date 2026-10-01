import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

async function identity(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

async function list_(env: Env) {
  return readJson(env, 'retrabalhos', { acao: 'LISTAR' })
}

async function mutation_(env: Env, payload: Record<string, unknown>) {
  let response: Response | undefined
  try {
    response = await mutateAppsScriptOnce(env, 'retrabalhos', payload)
    const upstream = await parseUpstream(response)
    if (upstream !== null) {
      if (!response.ok || !apiSucceeded(upstream)) throw new Error(upstream?.error?.message || 'Falha ao gravar.')
      return upstream
    }
  } catch (error) {
    if (error instanceof Error && error.message && !/fetch|network|invalid|response/i.test(error.message)) throw error
  }

  const current = await list_(env)
  const items = Array.isArray(current.data) ? current.data : []
  const action = String(payload.acao || '').toUpperCase()

  if (action === 'CRIAR') {
    const requestId = String(payload.requestId || '')
    const found = items.find((x: any) => String(x.requestId || '') === requestId)
    if (found) return { ok: true, data: found, reconciled: true }
  }

  if (action === 'EDITAR') {
    const id = String(payload.id || '')
    const previousVersion = Number(payload.versao || 0)
    const found = items.find((x: any) => String(x.id || '') === id && Number(x.versao || 0) > previousVersion)
    if (found) return { ok: true, data: found, reconciled: true }
  }

  throw new Error('Não foi possível confirmar o resultado da gravação. Atualize a lista antes de tentar novamente.')
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const url = new URL(request.url)
    if (url.searchParams.get('audit') === '1') {
      if (user.perfil === 'OPERACIONAL') return json({ ok: false, error: { message: 'Sem permissão.' } }, 403)
      return json(await readJson(env, 'audit', { acao: 'LISTAR', matriculaAutor: user.matricula }))
    }
    return json(await list_(env))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na leitura.'
    return json({ ok: false, error: { message: message === 'UNAUTHORIZED' ? 'Sessão inválida.' : message } }, message === 'UNAUTHORIZED' ? 401 : 502)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, { acao: 'CRIAR', ...body, matriculaAutor: user.matricula }))
  } catch (error) { return json({ ok: false, error: { message: error instanceof Error ? error.message : 'Falha ao gravar.' } }, 400) }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil === 'OPERACIONAL') return json({ ok: false, error: { message: 'Operacional não pode editar registros.' } }, 403)
    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, { acao: 'EDITAR', ...body, matriculaAutor: user.matricula }))
  } catch (error) { return json({ ok: false, error: { message: error instanceof Error ? error.message : 'Falha ao atualizar.' } }, 400) }
}
