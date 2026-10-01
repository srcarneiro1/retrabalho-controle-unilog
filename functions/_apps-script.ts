export interface AppsEnv { APPS_SCRIPT_URL: string; APPS_SCRIPT_GATEWAY_TOKEN: string }

function isRedirect(status: number) { return [301,302,303,307,308].includes(status) }

export async function callAppsScript(env: AppsEnv, route: string, payload: Record<string, unknown>) {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_GATEWAY_TOKEN) throw new Error('Gateway não configurado.')
  let url = new URL(env.APPS_SCRIPT_URL)
  url.searchParams.set('route', route)
  const body = JSON.stringify({ ...payload, _gatewayToken: env.APPS_SCRIPT_GATEWAY_TOKEN })

  for (let i = 0; i < 4; i++) {
    const response = await fetch(url.toString(), { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body, redirect: 'manual' })
    if (!isRedirect(response.status)) {
      const text = await response.text()
      const data = text ? JSON.parse(text) : {}
      if (!response.ok || data.ok === false) throw new Error(data?.error?.message || 'Falha no Apps Script.')
      return data
    }
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirect sem destino no Apps Script.')
    url = new URL(location, url)
  }
  throw new Error('Excesso de redirects no Apps Script.')
}
