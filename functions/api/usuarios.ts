import { callAppsScript } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

async function admin(request: Request, env: Env) {
  const user = await authorize(request, env)
  if (!user) throw new Error('UNAUTHORIZED')
  if (user.perfil !== 'ADMIN') throw new Error('FORBIDDEN')
  return user
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try { const user = await admin(request, env); return json(await callAppsScript(env, 'usuarios', { acao: 'LISTAR', matriculaAutor: user.matricula })) }
  catch (e) { return json({ ok:false,error:{message:e instanceof Error && e.message==='FORBIDDEN'?'Sem permissão.':'Sessão inválida.'}}, e instanceof Error && e.message==='FORBIDDEN'?403:401) }
}
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try { const user = await admin(request, env); const body = await request.json() as Record<string,unknown>; return json(await callAppsScript(env,'usuarios',{acao:'CRIAR',...body,matriculaAutor:user.matricula})) }
  catch (e) { return json({ok:false,error:{message:e instanceof Error?e.message:'Falha ao criar usuário.'}},400) }
}
