import { NextRequest, NextResponse } from 'next/server'

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

async function fetchAvailableDomain(): Promise<DomainResult> {
  let lastError: string = ''

  for (const provider of MAIL_PROVIDERS) {
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
      return NextResponse.json({ error: msg })
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
      return NextResponse.json({ error: 'Error de conexión al crear la cuenta. Intenta de nuevo.' })
    }

    if (!createRes.ok) {
      const errorText = await createRes.text()
      return NextResponse.json({
        error: `Error al crear cuenta (${createRes.status}). Intenta de nuevo.`,
        details: errorText,
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
      return NextResponse.json({ error: 'Error de conexión al obtener el token. Intenta de nuevo.' })
    }

    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'Error al obtener el token de acceso' })
    }

    const tokenData = await tokenRes.json()
    const token = tokenData.token || tokenData['hydra:member']?.token

    // Step 4: Try to save to database for session persistence
    const sessionId = req.headers.get('x-session-id')
    if (sessionId) {
      try {
        const { prisma, hasDatabaseUrl } = await import('@/lib/prisma')
        if (hasDatabaseUrl) {
          // Ensure session exists
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          await prisma.session.upsert({
            where: { id: sessionId },
            update: { lastSeen: new Date(), expiresAt },
            create: { id: sessionId, expiresAt },
          })

          await prisma.tempEmail.create({
            data: {
              sessionId,
              address,
              token,
              accountId: accountData.id,
              provider: provider.name,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
            },
          })
        }
      } catch {
        // DB save is non-critical — the email still works
      }
    }

    return NextResponse.json({
      address,
      token,
      id: accountData.id,
      provider: provider.name,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Error inesperado: ${message}` }, { status: 500 })
  }
}
