// Fluxo PHARMAESTETICS (17/11/2026): gateway da rota "pharma" do Apps Script. Mesmo padrão das demais rotas:
// matrícula e perfil vêm SÓ da sessão; o Apps Script reconfere escopo de filial, perfil e versão.
import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv, type SessionIdentity } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

const LEITURAS = ['CONFIG', 'MESES', 'LISTAR']
const GRAVACOES = ['CRIAR_LOTE', 'EDITAR', 'CANCELAR', 'IMPORTAR_PRODUTOS', 'CRIAR_VIGENCIA', 'HABILITAR_FILIAL']

async function identity(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  if (user.trocaSenhaObrigatoria) throw new Error('PASSWORD_CHANGE_REQUIRED')
  return user
}

function identityPayload(user: SessionIdentity) {
  return { matriculaAutor: user.matricula, perfilAutor: user.perfil }
}

async function gravar(env: Env, user: SessionIdentity, payload: Record<string, unknown>) {
  const enviar = async () => {
    const response = await mutateAppsScriptOnce(env, 'pharma', { ...payload, ...identityPayload(user) })
    const upstream = await parseUpstream(response)
    if (upstream === null) return null
    if (!response.ok || !apiSucceeded(upstream)) throw new Error(upstream?.error?.message || 'Falha ao gravar.')
    return upstream
  }
  try {
    const r = await enviar()
    if (r) return r
  } catch (error) {
    if (error instanceof Error && error.message && !/fetch|network|invalid|response|connection/i.test(error.message)) throw error
  }
  // Resposta ambígua. O lançamento de NF é idempotente pelo requestId no Apps Script: reenviar é seguro e devolve o
  // que já foi gravado (sem duplicar). As demais gravações não são repetidas às cegas.
  if (String(payload.acao) === 'CRIAR_LOTE' && payload.requestId) {
    const r = await enviar().catch(() => null)
    if (r) return { ...r, reconciled: true }
  }
  throw new Error('Não foi possível confirmar o resultado da gravação. Atualize a lista antes de tentar novamente.')
}

function errorResponse(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback
  if (message === 'UNAUTHORIZED') return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
  if (message === 'PASSWORD_CHANGE_REQUIRED') {
    return json({ ok: false, error: { message: 'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
  }
  return json({ ok: false, error: { message } }, status)
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    const params = new URL(request.url).searchParams
    const acao = String(params.get('acao') || 'CONFIG').toUpperCase()
    if (!LEITURAS.includes(acao)) return json({ ok: false, error: { message: 'Consulta inválida.' } }, 400)
    return json(await readJson(env, 'pharma', { acao, mes: params.get('mes') || '', ...identityPayload(user) }))
  } catch (error) {
    return errorResponse(error, 'Falha ao consultar o fluxo PHARMAESTETICS.', 502)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await identity(request, env)
    if (user.perfil === 'CLIENTE') return json({ ok: false, error: { message: 'Perfil CLIENTE é somente leitura.' } }, 403)
    const body = await request.json() as Record<string, unknown>
    const acao = String(body.acao || '').toUpperCase()
    if (!GRAVACOES.includes(acao)) return json({ ok: false, error: { message: 'Ação inválida.' } }, 400)
    return json(await gravar(env, user, { ...body, acao }))
  } catch (error) {
    return errorResponse(error, 'Falha ao gravar no fluxo PHARMAESTETICS.')
  }
}
