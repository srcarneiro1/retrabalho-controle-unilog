import { json, type GatewayAuthEnv } from '../_auth'

interface Env extends GatewayAuthEnv {
  APPS_SCRIPT_URL: string
  APPS_SCRIPT_GATEWAY_TOKEN: string
}

function htmlLike(text: string, contentType: string) {
  const t = text.trim().toLowerCase()
  return contentType.includes('text/html') || t.startsWith('<!doctype html') || t.startsWith('<html')
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.APPS_SCRIPT_URL) {
    return json({
      ok: false,
      stage: 'cloudflare',
      error: { message: 'APPS_SCRIPT_URL não configurada no Cloudflare.' },
    }, 500)
  }

  try {
    const url = new URL(env.APPS_SCRIPT_URL)
    url.searchParams.set('route', 'health')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'follow',
    })

    const text = await response.text()
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    const finalUrl = response.url || url.toString()
    const finalHost = (() => {
      try { return new URL(finalUrl).hostname } catch { return '' }
    })()

    if (htmlLike(text, contentType)) {
      const authPage =
        finalHost === 'accounts.google.com'
        || /sign in|fazer login|google accounts|authorization required/i.test(text)

      return json({
        ok: false,
        stage: 'apps-script',
        status: response.status,
        finalHost,
        kind: authPage ? 'GOOGLE_AUTH_REQUIRED' : 'HTML_INSTEAD_OF_JSON',
        error: {
          message: authPage
            ? 'O Web App está exigindo login Google. Reimplante com “Executar como: Eu” e “Quem pode acessar: Qualquer pessoa”.'
            : 'A URL /exec publicada não está retornando a API JSON esperada. Atualize a implantação para a versão atual do código.',
        },
      }, 502)
    }

    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      return json({
        ok: false,
        stage: 'apps-script',
        status: response.status,
        finalHost,
        kind: 'NON_JSON_RESPONSE',
        error: { message: 'O Apps Script respondeu conteúdo não JSON.' },
      }, 502)
    }

    if (payload?.ok !== true) {
      return json({
        ok: false,
        stage: 'apps-script',
        status: response.status,
        finalHost,
        payload,
        error: { message: payload?.error?.message || 'Health check do Apps Script falhou.' },
      }, 502)
    }

    return json({
      ok: true,
      stage: 'apps-script',
      status: response.status,
      finalHost,
      service: payload.service,
      version: payload.version,
    })
  } catch (error) {
    return json({
      ok: false,
      stage: 'cloudflare-to-apps-script',
      error: { message: error instanceof Error ? error.message : 'Falha ao consultar Apps Script.' },
    }, 502)
  }
}
