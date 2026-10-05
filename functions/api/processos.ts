import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv, type SessionIdentity } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

// 10 MB de arquivo ≈ 13,4 MB em base64.
const MAX_BASE64_LENGTH = 14 * 1024 * 1024

async function identity(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  if (user.trocaSenhaObrigatoria) throw new Error('PASSWORD_CHANGE_REQUIRED')
  if (user.perfil === 'CLIENTE') throw new Error('FORBIDDEN')
  return user
}

function identityPayload(user: SessionIdentity) {
  return { matriculaAutor: user.matricula, perfilAutor: user.perfil }
}

function errorResponse(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback
  if (message === 'UNAUTHORIZED') return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
  if (message === 'PASSWORD_CHANGE_REQUIRED') {
    return json({ ok: false, error: { message: 'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
  }
  if (message === 'FORBIDDEN') {
    return json({ ok: false, error: { message: 'Seu perfil não acessa os processos.' } }, 403)
  }
  return json({ ok: false, error: { message } }, status)
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const url = new URL(request.url)
    const id = String(url.searchParams.get('id') || '').trim()
    if (id) {
      return json(await readJson(env, 'processos', { acao: 'SKUS', idProcesso: id, ...identityPayload(user) }))
    }
    return json(await readJson(env, 'processos', { acao: 'LISTAR', ...identityPayload(user) }))
  } catch (error) {
    return errorResponse(error, 'Falha ao consultar processos.', 502)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const body = await request.json() as Record<string, unknown>
    if (String(body.arquivoBase64 || '').length > MAX_BASE64_LENGTH) {
      return json({ ok: false, error: { message: 'Arquivo acima de 10 MB.' } }, 413)
    }

    const payload = { ...body, acao: 'CRIAR', ...identityPayload(user) }
    try {
      const response = await mutateAppsScriptOnce(env, 'processos', payload)
      const upstream = await parseUpstream(response)
      if (upstream !== null) {
        if (!response.ok || !apiSucceeded(upstream)) {
          throw new Error(upstream?.error?.message || 'Falha ao enviar a planilha.')
        }
        return json(upstream)
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

    // Resposta ambígua: reconcilia por leitura, sem repetir o envio.
    const current = await readJson(env, 'processos', { acao: 'LISTAR', ...identityPayload(user) })
    const rows = Array.isArray(current.data) ? current.data : []
    const requestId = String(body.requestId || '')
    const found = rows.find((x: any) => String(x.requestId || '') === requestId)
    if (found) return json({ ok: true, data: found, reconciled: true })

    throw new Error('Não foi possível confirmar o envio. Atualize a lista de processos antes de tentar novamente.')
  } catch (error) {
    return errorResponse(error, 'Falha ao enviar a planilha.')
  }
}
