import { readJson } from '../../_apps-script'
import { createSession, json, type GatewayAuthEnv } from '../../_auth'

interface Env extends GatewayAuthEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

const LOCKED = /muitas tentativas/i

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as { matricula?: string; senha?: string }
    // Origem da requisição para o limite de tentativas (definida pelo Cloudflare, não pelo navegador).
    const origem = request.headers.get('CF-Connecting-IP') || ''
    const result = await readJson(env, 'auth', { acao: 'LOGIN', matricula: body.matricula, senha: body.senha, origem })
    const user = result.user
    if (!user) return json({ ok: false, error: { message: 'Credenciais inválidas.' } }, 401)
    const cookie = await createSession(env, user)
    return json({ ok: true, user }, 200, { 'set-cookie': cookie })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no login.'
    return json({ ok: false, error: { message } }, LOCKED.test(message) ? 429 : 401)
  }
}
