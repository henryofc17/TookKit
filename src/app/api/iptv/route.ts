import { NextRequest } from 'next/server'

export const runtime = 'edge'

// MAG STB headers — same as the Python checker uses
const STB_HEADERS: Record<string, string> = {
  'Cookie': 'stb_lang=en; timezone=Europe%2FIstanbul;',
  'X-User-Agent': 'Model: MAG254; Link: Ethernet',
  'Connection': 'Keep-Alive',
  'Accept-Encoding': 'gzip, deflate',
  'Accept': 'application/json,application/javascript,text/javascript,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
}

function formatDate(val: string | number | null | undefined): string {
  if (!val || val === 'null') return 'N/A'
  if (typeof val === 'number') {
    if (val === 0) return 'Unlimited'
    return new Date(val * 1000).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const num = Number(val)
  if (!isNaN(num) && num > 0) {
    return new Date(num * 1000).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  return String(val)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, host: hostInput, combo } = body

    let serverHost = ''
    let username = ''
    let password = ''

    // Parse input — supports multiple formats:
    // 1. Full URL: http://host:port/get.php?username=USER&password=PASS
    // 2. Player API URL: http://host:port/player_api.php?username=USER&password=PASS
    // 3. combo + host: "user:pass" with separate host field

    if (combo && hostInput) {
      // Format: user:pass with separate host
      const parts = combo.split(':')
      if (parts.length < 2) {
        return new Response(JSON.stringify({ status: 'bad', error: 'Invalid combo format' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      username = parts[0].trim()
      password = parts.slice(1).join(':').trim()
      let h = hostInput.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      serverHost = h
    } else if (url && typeof url === 'string') {
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return new Response(JSON.stringify({ status: 'bad', error: 'Invalid URL format' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      const hostname = parsedUrl.hostname
      const port = parsedUrl.port || '80'
      serverHost = `${hostname}:${port}`
      username = parsedUrl.searchParams.get('username') || ''
      password = parsedUrl.searchParams.get('password') || ''

      if (!username || !password) {
        return new Response(JSON.stringify({ status: 'bad', error: 'Missing username or password in URL' }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      return new Response(JSON.stringify({ error: 'URL or combo+host is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build the player API URL with &type=m3u like the Python code
    const apiUrl = `http://${serverHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: STB_HEADERS,
      })

      clearTimeout(timeoutId)

      const text = await response.text()

      // Check if response contains 'username' — the Python code checks for this
      if (text.includes('username')) {
        try {
          const json = JSON.parse(text)
          const userInfo = json?.user_info || {}
          const serverInfo = json?.server_info || {}

          const accountStatus = String(userInfo.status || '')

          if (accountStatus === 'Active') {
            // Fetch extra info: channels, films, series counts
            let channels = '0'
            let films = '0'
            let series = '0'

            const fetchCount = async (action: string): Promise<string> => {
              try {
                const c = new AbortController()
                const t = setTimeout(() => c.abort(), 8000)
                const r = await fetch(
                  `http://${serverHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}`,
                  { signal: c.signal, headers: STB_HEADERS }
                )
                clearTimeout(t)
                const txt = await r.text()
                return String(txt.split('stream_id').length - 1 || txt.split('series_id').length - 1 || '0')
              } catch {
                return '0'
              }
            }

            // Fetch counts in parallel
            const [chCount, filmCount, seriesCount] = await Promise.all([
              fetchCount('get_live_streams'),
              fetchCount('get_vod_streams'),
              fetchCount('get_series'),
            ])
            channels = chCount
            films = filmCount
            series = seriesCount

            // Build m3u link
            const m3uUrl = `http://${serverHost}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus`

            // Extract real server info
            const realUrl = serverInfo?.url ? String(serverInfo.url) : ''
            const realPort = serverInfo?.port ? String(serverInfo.port) : ''

            return new Response(JSON.stringify({
              status: 'hit',
              url: m3uUrl,
              host: serverHost,
              username,
              password,
              info: {
                status: userInfo.status || 'Active',
                active_cons: String(userInfo.active_cons ?? '0'),
                max_connections: String(userInfo.max_connections ?? '0'),
                created_at: formatDate(userInfo.created_at),
                exp_date: formatDate(userInfo.exp_date),
                timezone: serverInfo?.timezone || userInfo?.timezone || 'N/A',
                channels,
                films,
                series,
                real_url: realUrl,
                real_port: realPort,
                m3u_url: m3uUrl,
              },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        } catch {
          // JSON parse failed but response has 'username' — might still be a hit
          if (text.includes('Active')) {
            return new Response(JSON.stringify({
              status: 'hit',
              url: `http://${serverHost}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus`,
              host: serverHost,
              username,
              password,
              info: {
                status: 'Active',
                active_cons: '0',
                max_connections: '0',
                created_at: 'N/A',
                exp_date: 'N/A',
                timezone: 'N/A',
                channels: '0',
                films: '0',
                series: '0',
              },
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }
      }

      return new Response(JSON.stringify({ status: 'bad', host: serverHost, username }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (fetchError: unknown) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ status: 'timeout', host: serverHost, username }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ status: 'bad', host: serverHost, username, error: 'Connection failed' }), {
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
