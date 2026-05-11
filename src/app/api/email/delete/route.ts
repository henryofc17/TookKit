import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    const { accountId, token } = await req.json()

    if (!accountId || !token) {
      return new Response(JSON.stringify({ error: 'Account ID and token are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(`https://api.mail.tm/accounts/${accountId}`, {
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
