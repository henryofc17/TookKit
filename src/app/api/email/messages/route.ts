import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Provider base URLs
const PROVIDER_BASE_URLS: Record<string, string> = {
  'mail.tm': 'https://api.mail.tm',
  'mail.gw': 'https://api.mail.gw',
}

function getBaseUrl(provider?: string | null): string {
  if (provider && PROVIDER_BASE_URLS[provider]) {
    return PROVIDER_BASE_URLS[provider]
  }
  // Default to mail.tm if no provider specified
  return 'https://api.mail.tm'
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const provider = req.headers.get('X-Mail-Provider') || req.nextUrl.searchParams.get('provider')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const baseUrl = getBaseUrl(provider)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(`${baseUrl}/messages`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/ld+json',
          'Authorization': `Bearer ${token}`,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch messages', status: response.status }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const data = await response.json()

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Messages request timed out' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
