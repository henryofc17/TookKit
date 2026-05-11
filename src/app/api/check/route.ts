import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { cc } = await req.json()

    if (!cc || typeof cc !== 'string') {
      return new Response(JSON.stringify({ error: 'CC data is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Send tracking request to caseads
    const sessionId = crypto.randomUUID()
    const visitId = crypto.randomUUID()

    try {
      await fetch('https://trk.caseads.com/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cache: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3ZWJzaXRlSWQiOiI5MTlhMjEwMi1jMmVjLTQxMWMtYjQzMi02N2QwYWM3MjE0NDYiLCJzZXNzaW9uSWQiOiI5ZGJiZWM0NC00NzI4LTU0YjctOTdkOS1lMjBkZDVjYzQ2ODQiLCJ2aXNpdElkIjoiZjA2OWJkODEtMjk3MC01OTNhLTkxMTEtY2JlMjg5YTI4ZGViIiwiaWF0IjoxNzc2MDEyNzgzfQ.BE8XS-HL8e4u_hCI61htq8F7jDKXDHrg97CWHfbUQKs',
          sessionId,
          visitId,
          type: 'event',
          payload: {
            website: '919a2102-c2ec-411c-b432-67d0ac721446',
            screen: '384x832',
            language: 'es-US',
          },
        }),
      })
    } catch {
      // Tracking request is non-critical, continue anyway
    }

    // Send the actual check request
    const response = await fetch('https://api.chkr.cc/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://chkr.cc',
        Referer: 'https://chkr.cc/',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: cc,
        charge: false,
      }),
    })

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
