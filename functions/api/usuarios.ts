import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

async function admin(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  if (user.trocaSenhaObrigatoria) throw new Error('PASSWORD_CHANGE_REQUIRED')
  if (user.perfil !== 'ADMIN') throw new Error('FORBIDDEN')
  return user
}

async function list_(env: Env) {
  return readJson(env, 'usuarios', { acao: 'LISTAR' })
}

async function mutate_(env: Env, payload: Record<string, unknown>) {
  let response: Response | undefined
  try {
    response = await mutateAppsScriptOnce(env, 'usuarios', payload)
    const upstream = await parseUpstream(response)
    if (upstream !== null) {
      if (!response.ok || !apiSucceeded(upstream)) throw new Error(upstream?.error?.message || 'Falha ao alterar usuário.')
      return upstream
    }
  } catch (error) {
    if (error instanceof Error && error.message && !/fetch|network|invalid|response/i.test(error.message)) throw error
  }

  const current = await list_(env)
  const users = Array.isArray(current.data) ? current.data : []
  const matricula = String(payload.matricula || '')
  const found = users.find((x: any) => String(x.matricula || '') === matricula)
  const action = String(payload.acao || '').toUpperCase()

  if (action === 'CRIAR' && found) return { ok: true, data: found, reconciled: true }
  if (action === 'ATUALIZAR' && found) {
    const foundCnpjs = Array.isArray(found.cnpjs) ? found.cnpjs.map(String).sort().join('|') : ''
    const payloadCnpjs = Array.isArray(payload.cnpjs) ? payload.cnpjs.map(String).sort().join('|') : ''
    if (
      String(found.perfil || '') === String(payload.perfil || '')
      && String(found.ativo || '') === String(payload.ativo || '')
      && foundCnpjs === payloadCnpjs
    ) {
      return { ok: true, data: found, reconciled: true }
    }
  }

  throw new Error('Não foi possível confirmar a alteração de usuário. Recarregue a lista antes de tentar novamente.')
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try { await admin(request, env); return json(await list_(env)) }
  catch (e) {
    const m = e instanceof Error ? e.message : 'Falha.'
    if (m === 'PASSWORD_CHANGE_REQUIRED') return json({ ok:false,error:{message:'Troque a senha temporária antes de utilizar o sistema.'}},403)
    return json({ ok:false,error:{message:m==='FORBIDDEN'?'Sem permissão.':'Sessão inválida.'}}, m==='FORBIDDEN'?403:401)
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await admin(request, env)
    const body = await request.json() as Record<string,unknown>
    return json(await mutate_(env,{...body,acao:'CRIAR',matriculaAutor:user.matricula}))
  } catch (e) { return json({ok:false,error:{message:e instanceof Error?e.message:'Falha ao criar usuário.'}},400) }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await admin(request, env)
    const body = await request.json() as Record<string,unknown>
    return json(await mutate_(env,{...body,acao:'ATUALIZAR',matriculaAutor:user.matricula}))
  } catch (e) { return json({ok:false,error:{message:e instanceof Error?e.message:'Falha ao atualizar usuário.'}},400) }
}
