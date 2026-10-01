import { clearSession, json } from '../../_auth'
export const onRequestPost: PagesFunction = async () => json({ ok: true }, 200, { 'set-cookie': clearSession() })
