import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse the URL to extract host, username, password
    // Format: http://host:port/get.php?username=USER&password=PASS
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ status: 'bad', error: 'Invalid URL format' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const host = parsedUrl.hostname
    const port = parsedUrl.port || '80'
    const username = parsedUrl.searchParams.get('username')
    const password = parsedUrl.searchParams.get('password')

    if (!username || !password) {
      return new Response(JSON.stringify({ status: 'bad', error: 'Missing username or password' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build the player API URL
    const apiUrl = `http://${host}:${port}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'IPTV/1.0',
        },
      })

      clearTimeout(timeoutId)

      const text = await response.text()

      // Check if response contains "Active" which indicates a working account
      if (text.includes('Active') || text.includes('"user_info"') || text.includes('"server_info"')) {
        // Try to parse as JSON for more info
        try {
          const json = JSON.parse(text)
          const status = json?.user_info?.status
          if (status === 'Active' || text.includes('Active')) {
            // Extract detailed user info
            const userInfo = json?.user_info || {}
            const serverInfo = json?.server_info || {}

            // Format dates from timestamps if needed
            const formatDate = (val: string | number | undefined): string => {
              if (!val) return 'N/A'
              if (typeof val === 'number') {
                // If it's a unix timestamp
                return new Date(val * 1000).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
              }
              return String(val)
            }

            return new Response(JSON.stringify({
              status: 'hit',
              url: `http://${host}:${port}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
              host: `${host}:${port}`,
              username,
              password,
              info: {
                status: userInfo.status || 'Active',
                active_cons: userInfo.active_cons ?? '0',
                max_connections: userInfo.max_connections ?? '0',
                created_at: formatDate(userInfo.created_at),
                exp_date: formatDate(userInfo.exp_date),
                timezone: serverInfo?.timezone || userInfo?.timezone || 'N/A',
              },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        } catch {
          // Text includes "Active" but isn't valid JSON
          if (text.includes('Active')) {
            return new Response(JSON.stringify({
              status: 'hit',
              url: `http://${host}:${port}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
              host: `${host}:${port}`,
              username,
              password,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }
      }

      return new Response(JSON.stringify({ status: 'bad', host: `${host}:${port}`, username }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (fetchError: unknown) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ status: 'timeout', host: `${host}:${port}`, username }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ status: 'bad', host: `${host}:${port}`, username, error: 'Connection failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
