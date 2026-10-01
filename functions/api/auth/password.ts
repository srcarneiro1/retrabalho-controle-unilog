import { apiSucceeded, mutateAppsScriptOnce, parseUpstream, readJson } from '../../_apps-script'
import { authorize, json, type GatewayAuthEnv } from '../../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await authorize(request, env)
  if (!user) return json({ ok: false, error: { message: 'Sessão inválida.' } }, 401)

  try {
    const body = await request.json() as { novaSenha?: string }
    const novaSenha = String(body.novaSenha || '')
    if (novaSenha.length < 8) {
      return json({ ok: false, error: { message: 'A nova senha deve possuir pelo menos 8 caracteres.' } }, 400)
    }

    const response = await mutateAppsScriptOnce(env, 'auth', {
      acao: 'TROCAR_SENHA',
      matricula: user.matricula,
      novaSenha,
    })

    const upstream = await parseUpstream(response)
    if (upstream !== null) {
      if (!response.ok || !apiSucceeded(upstream)) {
        throw new Error(upstream?.error?.message || 'Falha ao alterar a senha.')
      }
      return json({ ok: true })
    }

    const confirmed = await readJson(env, 'auth', {
      acao: 'LOGIN',
      matricula: user.matricula,
      senha: novaSenha,
    })

    if (
      String(confirmed?.user?.matricula || '') === user.matricula
      && confirmed?.user?.trocaSenhaObrigatoria === false
    ) {
      return json({ ok: true, reconciled: true })
    }

    return json({
      ok: false,
      error: { message: 'Não foi possível confirmar a troca de senha. Entre novamente antes de repetir a operação.' },
    }, 502)
  } catch (error) {
    return json({
      ok: false,
      error: { message: error instanceof Error ? error.message : 'Falha ao alterar a senha.' },
    }, 400)
  }
}
