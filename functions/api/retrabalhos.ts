import { callAppsScript } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

async function identity(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const url = new URL(request.url)
    if (url.searchParams.get('audit') === '1') {
      if (user.perfil === 'OPERACIONAL') return json({ ok: false, error: { message: 'Sem permissão.' } }, 403)
      const result = await callAppsScript(env, 'audit', { acao: 'LISTAR', matriculaAutor: user.matricula })
      return json(result)
    }
    return json(await callAppsScript(env, 'retrabalhos', { acao: 'LISTAR', matriculaAutor: user.matricula }))
  } catch (error) { return json({ ok: false, error: { message: error instanceof Error && error.message === 'UNAUTHORIZED' ? 'Sessão inválida.' : String(error) } }, 401) }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const body = await request.json() as Record<string, unknown>
    // Mutação executada exatamente uma vez.
    return json(await callAppsScript(env, 'retrabalhos', { acao: 'CRIAR', ...body, matriculaAutor: user.matricula }))
  } catch (error) { return json({ ok: false, error: { message: error instanceof Error ? error.message : 'Falha ao gravar.' } }, 400) }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil === 'OPERACIONAL') return json({ ok: false, error: { message: 'Operacional não pode editar registros.' } }, 403)
    const body = await request.json() as Record<string, unknown>
    // Mutação executada exatamente uma vez; controle otimista por versão no Apps Script.
    return json(await callAppsScript(env, 'retrabalhos', { acao: 'EDITAR', ...body, matriculaAutor: user.matricula }))
  } catch (error) { return json({ ok: false, error: { message: error instanceof Error ? error.message : 'Falha ao atualizar.' } }, 400) }
}
