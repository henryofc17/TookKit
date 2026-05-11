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

export async function DELETE(req: NextRequest) {
  try {
    const { accountId, token, provider } = await req.json()

    if (!accountId || !token) {
      return new Response(JSON.stringify({ error: 'Account ID and token are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const baseUrl = getBaseUrl(provider)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(`${baseUrl}/accounts/${accountId}`, {
        method: 'DELETE',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      clearTimeout(timeoutId)

      // 204 No Content is the expected success response
      if (!response.ok && response.status !== 204) {
        // If 404, the account was already deleted — treat as success
        if (response.status === 404) {
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Delete request timed out' }), {
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
