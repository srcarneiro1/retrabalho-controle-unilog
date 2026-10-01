import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

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

async function list_(env: Env) {
  return readJson(env, 'precos', { acao: 'LISTAR' })
}

async function create_(env: Env, payload: Record<string, unknown>) {
  try {
    const response = await mutateAppsScriptOnce(env, 'precos', payload)
    const upstream = await parseUpstream(response)
    if (upstream !== null) {
      if (!response.ok || !apiSucceeded(upstream)) {
        throw new Error(upstream?.error?.message || 'Falha ao criar vigência.')
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
  const rows = Array.isArray(current.data) ? current.data : []
  const requestId = String(payload.requestId || '')
  const found = rows.find((x: any) => String(x.requestId || '') === requestId)
  if (found) return { ok: true, data: found, reconciled: true }

  throw new Error(
    'Não foi possível confirmar a nova vigência. Atualize a tabela antes de tentar novamente.'
  )
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await identity(request, env)
    return json(await list_(env))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar preços.'
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'PASSWORD_CHANGE_REQUIRED' ? 403 : 502
    return json({ ok: false, error: { message } }, status)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil !== 'ADMIN') {
      return json({ ok: false, error: { message: 'Apenas ADMIN pode criar nova vigência de preço.' } }, 403)
    }

    const body = await request.json() as Record<string, unknown>
    return json(await create_(env, {
      acao: 'CRIAR_VIGENCIA',
      ...body,
      matriculaAutor: user.matricula,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar vigência.'
    return json({ ok: false, error: { message } }, 400)
  }
}
