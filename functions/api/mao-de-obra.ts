import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv, type SessionIdentity } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

async function identity(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  if (user.trocaSenhaObrigatoria) throw new Error('PASSWORD_CHANGE_REQUIRED')
  if (user.perfil === 'CLIENTE') throw new Error('FORBIDDEN')
  return user
}

function identityPayload(user: SessionIdentity) {
  return {
    matriculaAutor: user.matricula,
    perfilAutor: user.perfil,
  }
}

async function list_(env: Env, user: SessionIdentity) {
  return readJson(env, 'maodeobra', { acao: 'LISTAR', ...identityPayload(user) })
}

async function mutation_(env: Env, user: SessionIdentity, payload: Record<string, unknown>) {
  try {
    const response = await mutateAppsScriptOnce(env, 'maodeobra', {
      ...payload,
      ...identityPayload(user),
    })
    const upstream = await parseUpstream(response)
    if (upstream !== null) {
      if (!response.ok || !apiSucceeded(upstream)) {
        throw new Error(upstream?.error?.message || 'Falha ao gravar.')
      }
      return upstream
    }
  } catch (error) {
    if (
      error instanceof Error
      && error.message
      && !/fetch|network|invalid|response|connection/i.test(error.message)
    ) {
      throw error
    }
  }

  // Resposta ambígua: reconcilia por leitura, sem repetir o POST.
  const current = await list_(env, user)
  const rows = Array.isArray(current.data) ? current.data : []
  const action = String(payload.acao || '').toUpperCase()

  if (action === 'CRIAR') {
    const requestId = String(payload.requestId || '')
    const found = rows.find((x: any) => String(x.requestId || '') === requestId)
    if (found) return { ok: true, data: found, reconciled: true }
  }

  if (action === 'EDITAR') {
    const id = String(payload.id || '')
    const previousVersion = Number(payload.versao || 0)
    const found = rows.find(
      (x: any) => String(x.id || '') === id && Number(x.versao || 0) > previousVersion,
    )
    if (found) return { ok: true, data: found, reconciled: true }
  }

  if (action === 'INATIVAR') {
    // Inativado deixa de aparecer na lista de ativos.
    const id = String(payload.id || '')
    if (!rows.some((x: any) => String(x.id || '') === id)) {
      return { ok: true, data: { id, ativo: 'NAO' }, reconciled: true }
    }
  }

  throw new Error(
    'Não foi possível confirmar o resultado da gravação. Atualize a lista antes de tentar novamente.',
  )
}

function errorResponse(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback
  if (message === 'UNAUTHORIZED') return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
  if (message === 'PASSWORD_CHANGE_REQUIRED') {
    return json({ ok: false, error: { message: 'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
  }
  if (message === 'FORBIDDEN') {
    return json({ ok: false, error: { message: 'Seu perfil não acessa o controle de mão de obra.' } }, 403)
  }
  return json({ ok: false, error: { message } }, status)
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    return json(await list_(env, user))
  } catch (error) {
    return errorResponse(error, 'Falha ao consultar mão de obra.', 502)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, user, { ...body, acao: 'CRIAR' }))
  } catch (error) {
    return errorResponse(error, 'Falha ao gravar mão de obra.')
  }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil !== 'SUPERVISOR' && user.perfil !== 'ADMIN') {
      return json({ ok: false, error: { message: 'Somente SUPERVISOR e ADMIN podem editar a mão de obra.' } }, 403)
    }
    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, user, { ...body, acao: 'EDITAR' }))
  } catch (error) {
    return errorResponse(error, 'Falha ao atualizar mão de obra.')
  }
}

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil !== 'SUPERVISOR' && user.perfil !== 'ADMIN') {
      return json({ ok: false, error: { message: 'Somente SUPERVISOR e ADMIN podem inativar lançamentos de mão de obra.' } }, 403)
    }
    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, user, { ...body, acao: 'INATIVAR' }))
  } catch (error) {
    return errorResponse(error, 'Falha ao inativar mão de obra.')
  }
}
