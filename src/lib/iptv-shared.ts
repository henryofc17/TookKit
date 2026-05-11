/**
 * Shared IPTV utilities — eliminates code duplication across API routes.
 * All constants and helper functions used by multiple IPTV endpoints.
 */

// MAG STB headers — same as the Python checker uses
export const STB_HEADERS: Record<string, string> = {
  'Cookie': 'stb_lang=en; timezone=Europe%2FIstanbul;',
  'X-User-Agent': 'Model: MAG254; Link: Ethernet',
  'Connection': 'Keep-Alive',
  'Accept-Encoding': 'gzip, deflate',
  'Accept': 'application/json,application/javascript,text/javascript,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
}

/**
 * Format a timestamp from IPTV server response to a readable date.
 */
export function formatDate(val: string | number | null | undefined): string {
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

/**
 * Check a single IPTV line (URL or combo format).
 * Returns the result with status: hit | bad | timeout
 */
export async function checkLine(
  line: string,
  inputMode: 'url' | 'combo',
  serverHost: string
): Promise<{
  status: string
  host?: string
  username?: string
  password?: string
  url?: string
  info?: Record<string, unknown>
  error?: string
}> {
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
 * Helper to get or create a session from the request headers.
 */
export function getSessionId(request: Request): string | null {
  return request.headers.get('x-session-id')
}
