import { SignJWT, jwtVerify } from 'jose'

export interface GatewayAuthEnv { APP_SESSION_SECRET?: string }
export type SessionIdentity = {
  matricula: string
  nome: string
  perfil: 'OPERACIONAL' | 'SUPERVISOR' | 'ADMIN'
  trocaSenhaObrigatoria?: boolean
}

const COOKIE = 'rework_session'

function secret(env: GatewayAuthEnv) {
  if (!env.APP_SESSION_SECRET || env.APP_SESSION_SECRET.length < 32) {
    throw new Error('APP_SESSION_SECRET deve ter pelo menos 32 caracteres.')
  }
  return new TextEncoder().encode(env.APP_SESSION_SECRET)
}

export async function createSession(env: GatewayAuthEnv, identity: SessionIdentity) {
  const token = await new SignJWT(identity as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret(env))

  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`
}

export function clearSession() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export async function authorize(request: Request, env: GatewayAuthEnv): Promise<SessionIdentity | null> {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  if (!match) return null

  try {
    const { payload } = await jwtVerify(match[1], secret(env))
    return {
      matricula: String(payload.matricula || ''),
      nome: String(payload.nome || ''),
      perfil: String(payload.perfil || '') as SessionIdentity['perfil'],
      trocaSenhaObrigatoria: payload.trocaSenhaObrigatoria === true,
    }
  } catch {
    return null
  }
}

export function json(payload: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  })
}
