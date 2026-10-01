export interface AppsEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

const EXEC_HOST = 'script.google.com'
const CONTENT_HOST = 'script.googleusercontent.com'
const MAX_REDIRECTS = 4

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
    if (next.hostname === CONTENT_HOST) {
      return fetch(next.toString(), { method: 'GET', headers: { accept: 'application/json' }, redirect: 'follow' })
    }
    if (next.hostname === EXEC_HOST) {
      current = next.toString()
      continue
    }
    return response
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

export async function readJson(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  const response = await readAppsScript(env, route, payload)
  const upstream = await parseUpstream(response)
  if (upstream === null) throw new Error('Apps Script retornou uma resposta inválida.')
  if (!response.ok || !apiSucceeded(upstream)) throw new Error(upstream?.error?.message || 'Falha no Apps Script.')
  return upstream
}
