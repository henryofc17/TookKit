import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    // Step 1: Get available domains
    const domainsRes = await fetch('https://api.mail.tm/domains', {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!domainsRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch domains' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const domainsData = await domainsRes.json()
    const domains = domainsData['hydra:member'] || domainsData

    if (!domains || domains.length === 0) {
      return new Response(JSON.stringify({ error: 'No domains available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const domain = domains[0].domain

    // Step 2: Generate random email and create account
    const randomName = Math.random().toString(36).substring(2, 10)
    const address = `${randomName}@${domain}`
    const password = Math.random().toString(36).substring(2, 14) + 'A1!'

    const createRes = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ address, password }),
    })

    if (!createRes.ok) {
      const errorText = await createRes.text()
      return new Response(JSON.stringify({ error: 'Failed to create account', details: errorText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const accountData = await createRes.json()

    // Step 3: Get JWT token
    const tokenRes = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ address, password }),
    })

    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to get token' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tokenData = await tokenRes.json()

    return new Response(JSON.stringify({
      address,
      token: tokenData.token,
      id: accountData.id,
    }), {
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
