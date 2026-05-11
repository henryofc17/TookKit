import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Both providers share the same API format but are separate backends
const MAIL_PROVIDERS = [
  { name: 'mail.tm', baseUrl: 'https://api.mail.tm' },
  { name: 'mail.gw', baseUrl: 'https://api.mail.gw' },
]

const MAIL_TM_HEADERS: Record<string, string> = {
  'Accept': 'application/ld+json',
  'Content-Type': 'application/json',
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

interface DomainResult {
  domain: string
  provider: { name: string; baseUrl: string }
}

/**
 * Try to fetch available domains from all providers until one succeeds.
 * Returns the first available active domain and its provider.
 */
async function fetchAvailableDomain(): Promise<DomainResult> {
  let lastError: string = ''

  for (const provider of MAIL_PROVIDERS) {
    // Try up to 3 times per provider
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const domainsRes = await fetchWithTimeout(`${provider.baseUrl}/domains`, {
          headers: { Accept: 'application/ld+json' },
        })

        if (domainsRes.ok) {
          const domainsData = await domainsRes.json()
          const domains = domainsData['hydra:member'] || domainsData

          if (Array.isArray(domains) && domains.length > 0) {
            const activeDomains = domains.filter((d: { isActive?: boolean }) => d.isActive !== false)
            if (activeDomains.length > 0) {
              const domain = activeDomains[Math.floor(Math.random() * activeDomains.length)].domain
              return { domain, provider }
            }
          }
          lastError = `${provider.name}: No hay dominios activos`
        } else {
          lastError = `${provider.name}: HTTP ${domainsRes.status}`
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error'
        lastError = `${provider.name}: ${msg}`
      }

      // Wait before retry (except on last attempt)
      if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
    }
  }

  throw new Error(`No se pudieron obtener los dominios (${lastError}). Intenta de nuevo en unos segundos.`)
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Get available domains (tries all providers)
    let domainResult: DomainResult
    try {
      domainResult = await fetchAvailableDomain()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      return new Response(JSON.stringify({ error: msg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { domain, provider } = domainResult
    const baseUrl = provider.baseUrl

    // Step 2: Generate random email and create account
    const randomName = Math.random().toString(36).substring(2, 10)
    const address = `${randomName}@${domain}`
    const password = Math.random().toString(36).substring(2, 14) + 'A1!'

    let createRes: Response | null = null
    try {
      createRes = await fetchWithTimeout(`${baseUrl}/accounts`, {
        method: 'POST',
        headers: MAIL_TM_HEADERS,
        body: JSON.stringify({ address, password }),
      })
    } catch {
      return new Response(JSON.stringify({ error: 'Error de conexión al crear la cuenta. Intenta de nuevo.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!createRes.ok) {
      const errorText = await createRes.text()
      return new Response(JSON.stringify({
        error: `Error al crear cuenta (${createRes.status}). Intenta de nuevo.`,
        details: errorText,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accountData = await createRes.json()

    // Step 3: Get JWT token
    let tokenRes: Response | null = null
    try {
      tokenRes = await fetchWithTimeout(`${baseUrl}/token`, {
        method: 'POST',
        headers: MAIL_TM_HEADERS,
        body: JSON.stringify({ address, password }),
      })
    } catch {
      return new Response(JSON.stringify({ error: 'Error de conexión al obtener el token. Intenta de nuevo.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Error al obtener el token de acceso' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tokenData = await tokenRes.json()

    return new Response(JSON.stringify({
      address,
      token: tokenData.token || tokenData['hydra:member']?.token,
      id: accountData.id,
      provider: provider.name,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: `Error inesperado: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
