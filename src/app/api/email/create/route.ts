import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// mail.tm API uses JSON-LD — must use the correct Accept header
const MAIL_TM_HEADERS: Record<string, string> = {
  'Accept': 'application/ld+json',
  'Content-Type': 'application/json',
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
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

export async function POST(req: NextRequest) {
  try {
    // Step 1: Get available domains (with retry)
    let domainsRes: Response | null = null
    let lastError: string = ''

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        domainsRes = await fetchWithTimeout('https://api.mail.tm/domains', {
          headers: { Accept: 'application/ld+json' },
        })
        if (domainsRes.ok) break
        lastError = `HTTP ${domainsRes.status}`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error'
        lastError = msg
        // Wait before retry (except on last attempt)
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }

    if (!domainsRes || !domainsRes.ok) {
      return new Response(JSON.stringify({
        error: `No se pudieron obtener los dominios de mail.tm (${lastError}). Intenta de nuevo en unos segundos.`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const domainsData = await domainsRes.json()
    // mail.tm returns hydra:member format for JSON-LD
    const domains = domainsData['hydra:member'] || domainsData

    if (!Array.isArray(domains) || domains.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay dominios disponibles en mail.tm' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Pick a random active domain for variety
    const activeDomains = domains.filter((d: { isActive?: boolean }) => d.isActive !== false)
    if (activeDomains.length === 0) {
      return new Response(JSON.stringify({ error: 'No hay dominios activos disponibles' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const domain = activeDomains[Math.floor(Math.random() * activeDomains.length)].domain

    // Step 2: Generate random email and create account
    const randomName = Math.random().toString(36).substring(2, 10)
    const address = `${randomName}@${domain}`
    const password = Math.random().toString(36).substring(2, 14) + 'A1!'

    let createRes: Response | null = null
    try {
      createRes = await fetchWithTimeout('https://api.mail.tm/accounts', {
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
      // If this domain fails, it might be a mail.tm issue — return a helpful error
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
      tokenRes = await fetchWithTimeout('https://api.mail.tm/token', {
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
