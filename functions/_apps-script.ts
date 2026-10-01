export interface AppsEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

const EXEC_HOST = 'script.google.com'
const CONTENT_HOST = 'script.googleusercontent.com'
const MAX_REDIRECTS = 4
const READ_RETRY_DELAY_MS = 250

function targetUrl(env: AppsEnv, route: string) {
  const url = new URL(env.APPS_SCRIPT_URL)
  url.searchParams.set('route', route)
  return url
}

function serviceBody(env: AppsEnv, payload: Record<string, unknown>) {
  return JSON.stringify({ ...payload, _gatewayToken: env.APPS_SCRIPT_GATEWAY_TOKEN })
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function redirectError_(next: URL) {
  if (next.hostname === 'accounts.google.com' || next.hostname.endsWith('.google.com') && next.pathname.includes('/accounts')) {
    return new Error(
      'O Web App do Apps Script está exigindo autenticação Google. Na implantação, use Executar como: Eu e Quem pode acessar: Qualquer pessoa.'
    )
  }

  return new Error(
    'O Apps Script redirecionou para um destino inesperado (' + next.hostname + '). Confirme a URL /exec da implantação configurada no Cloudflare.'
  )
}

function looksLikeHtml(text: string, contentType: string) {
  const normalized = text.trim().toLowerCase()
  return contentType.includes('text/html')
    || normalized.startsWith('<!doctype html')
    || normalized.startsWith('<html')
}

function invalidResponseMessage(response: Response, text: string) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  const finalHost = (() => {
    try { return new URL(response.url).hostname } catch { return '' }
  })()

  if (looksLikeHtml(text, contentType)) {
    if (
      finalHost.includes('accounts.google.com')
      || /sign in|fazer login|google accounts|authorization required/i.test(text)
    ) {
      return 'O Web App do Apps Script não está acessível anonimamente. Revise a implantação e mantenha “Quem pode acessar: Qualquer pessoa”.'
    }

    if (finalHost === EXEC_HOST || finalHost === CONTENT_HOST || finalHost.endsWith('.googleusercontent.com')) {
      return 'O Apps Script publicou HTML em vez da API JSON. A implantação /exec ativa não corresponde ao Web App esperado ou está com permissão incorreta.'
    }
  }

  return `Apps Script retornou uma resposta inválida (HTTP ${response.status || 0}).`
}

export async function parseUpstream(response: Response): Promise<any | null> {
  const text = await response.text()
  try { return JSON.parse(text) } catch { return null }
}

export function apiSucceeded(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && 'ok' in payload && (payload as { ok?: unknown }).ok === true
}

export async function readAppsScript(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_GATEWAY_TOKEN) throw new Error('Gateway não configurado.')
  let current = targetUrl(env, route).toString()
  const body = serviceBody(env, payload)

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body,
      redirect: 'manual',
    })

    if (!isRedirect(response.status)) return response

    const location = response.headers.get('location')
    if (!location) return response

    const next = new URL(location, current)
    if (next.hostname === CONTENT_HOST || next.hostname.endsWith('.googleusercontent.com')) {
      return fetch(next.toString(), {
        method: 'GET',
        headers: { accept: 'application/json' },
        redirect: 'follow',
      })
    }

    if (next.hostname === EXEC_HOST) {
      current = next.toString()
      continue
    }

    throw redirectError_(next)
  }

  throw new Error('Apps Script excedeu o limite de redirecionamentos.')
}

export async function mutateAppsScriptOnce(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_GATEWAY_TOKEN) throw new Error('Gateway não configurado.')
  return fetch(targetUrl(env, route).toString(), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: serviceBody(env, payload),
    redirect: 'follow',
  })
}

async function readJsonOnce(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  const response = await readAppsScript(env, route, payload)
  const text = await response.text()

  let upstream: any
  try {
    upstream = JSON.parse(text)
  } catch {
    throw new Error(invalidResponseMessage(response, text))
  }

  if (!response.ok || !apiSucceeded(upstream)) {
    throw new Error(upstream?.error?.message || 'Falha no Apps Script.')
  }
  return upstream
}

export async function readJson(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  try {
    return await readJsonOnce(env, route, payload)
  } catch (firstError) {
    const message = firstError instanceof Error ? firstError.message : ''
    const retryable = /resposta inválida|excedeu o limite|fetch|network|connection|temporariamente/i.test(message)

    if (!retryable) throw firstError

    await delay(READ_RETRY_DELAY_MS)
    return readJsonOnce(env, route, payload)
  }
}
