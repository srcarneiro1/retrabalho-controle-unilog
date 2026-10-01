import { readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await authorize(request, env)
    if (!user) return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)
    if (user.trocaSenhaObrigatoria) {
      return json({ ok: false, error: { message: 'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
    }

    const url = new URL(request.url)
    const all = url.searchParams.get('all') === '1'

    if (all && user.perfil !== 'ADMIN') {
      return json({ ok: false, error: { message: 'Sem permissão.' } }, 403)
    }

    return json(await readJson(env, 'filiais', {
      acao: all ? 'LISTAR_TODAS' : 'LISTAR',
      matriculaAutor: user.matricula,
      perfilAutor: user.perfil,
    }))
  } catch (error) {
    return json({
      ok: false,
      error: { message: error instanceof Error ? error.message : 'Falha ao consultar filiais.' },
    }, 502)
  }
}
