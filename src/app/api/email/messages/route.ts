import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch('https://api.mail.tm/messages', {
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
