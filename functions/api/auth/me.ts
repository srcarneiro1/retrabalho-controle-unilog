import { authorize, json, type GatewayAuthEnv } from '../../_auth'
export const onRequestGet: PagesFunction<GatewayAuthEnv> = async ({ request, env }) => {
  const user = await authorize(request, env)
  return user ? json({ ok: true, user }) : json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
}
