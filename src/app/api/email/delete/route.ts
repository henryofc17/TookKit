import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function DELETE(req: NextRequest) {
  try {
    const { accountId, token } = await req.json()

    if (!accountId || !token) {
      return new Response(JSON.stringify({ error: 'Account ID and token are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch(`https://api.mail.tm/accounts/${accountId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok && response.status !== 204) {
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
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
