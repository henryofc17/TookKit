import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch(`https://api.mail.tm/messages/${id}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch message' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
