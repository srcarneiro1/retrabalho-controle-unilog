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
  return user
}

function monthFrom(url: URL, user: SessionIdentity) {
  const mes = String(url.searchParams.get('mes') || '').trim()
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new Error('MONTH_INVALID')
  if (user.perfil === 'CLIENTE' && !mes) throw new Error('MONTH_REQUIRED')
  return mes
}

async function list_(env: Env, mes = '') {
  return readJson(env, 'retrabalhos', { acao: 'LISTAR', mes })
}

async function mutation_(env: Env, payload: Record<string, unknown>) {
  let response: Response | undefined

  try {
    response = await mutateAppsScriptOnce(env, 'retrabalhos', payload)
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
    const found = items.find(
      (x: any) => String(x.id || '') === id && Number(x.versao || 0) > previousVersion
    )
    if (found) return { ok: true, data: found, reconciled: true }
  }

  throw new Error(
    'Não foi possível confirmar o resultado da gravação. Atualize a lista antes de tentar novamente.'
  )
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha na operação.'
  if (message === 'UNAUTHORIZED') {
    return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
  }
  if (message === 'PASSWORD_CHANGE_REQUIRED') {
    return json({
      ok: false,
      error: { message: 'Troque a senha temporária antes de utilizar o sistema.' },
    }, 403)
  }
  if (message === 'MONTH_REQUIRED') {
    return json({
      ok: false,
      error: { message: 'O perfil CLIENTE deve informar uma competência mensal.' },
    }, 400)
  }
  if (message === 'MONTH_INVALID') {
    return json({
      ok: false,
      error: { message: 'Competência mensal inválida.' },
    }, 400)
  }
  return json({ ok: false, error: { message } }, 502)
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const url = new URL(request.url)

    if (url.searchParams.get('months') === '1') {
      return json(await readJson(env, 'retrabalhos', { acao: 'MESES' }))
    }

    const mes = monthFrom(url, user)

    if (url.searchParams.get('audit') === '1') {
      if (user.perfil === 'OPERACIONAL') {
        return json({ ok: false, error: { message: 'Sem permissão.' } }, 403)
      }
      return json(await readJson(env, 'audit', {
        acao: 'LISTAR',
        mes,
        matriculaAutor: user.matricula,
      }))
    }

    return json(await list_(env, mes))
  } catch (error) {
    return errorResponse(error)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil === 'CLIENTE') {
      return json({ ok: false, error: { message: 'Perfil CLIENTE é somente leitura.' } }, 403)
    }

    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, {
      acao: 'CRIAR',
      ...body,
      matriculaAutor: user.matricula,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao gravar.'
    return json({ ok: false, error: { message } }, 400)
  }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil === 'OPERACIONAL' || user.perfil === 'CLIENTE') {
      return json({
        ok: false,
        error: { message: 'Seu perfil não pode editar registros.' },
      }, 403)
    }

    const body = await request.json() as Record<string, unknown>
    return json(await mutation_(env, {
      acao: 'EDITAR',
      ...body,
      matriculaAutor: user.matricula,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar.'
    return json({ ok: false, error: { message } }, 400)
  }
}
