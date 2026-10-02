import { readJson } from '../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = await authorize(request, env)
    if (!user) return json({ ok:false, error:{ message:'Sessão inválida.' } }, 401)
    if (user.trocaSenhaObrigatoria) {
      return json({ ok:false, error:{ message:'Troque a senha temporária antes de utilizar o sistema.' } }, 403)
    }

    const url = new URL(request.url)
    const mes = String(url.searchParams.get('mes') || '').trim()
    const periodOnly = url.searchParams.get('period') === '1'

    if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
      return json({ ok:false, error:{ message:'Competência mensal inválida.' } }, 400)
    }

    return json(await readJson(env, 'bootstrap', {
      acao: periodOnly ? 'COMPETENCIA' : 'CARREGAR',
      mes,
      matriculaAutor: user.matricula,
      perfilAutor: user.perfil,
    }))
  } catch (error) {
    return json({
      ok:false,
      error:{ message:error instanceof Error ? error.message : 'Falha ao preparar o ambiente.' }
    }, 502)
  }
}
