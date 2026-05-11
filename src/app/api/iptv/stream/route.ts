import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// MAG STB headers for IPTV streams
const STB_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
  'Cookie': 'stb_lang=en; timezone=Europe%2FIstanbul;',
  'X-User-Agent': 'Model: MAG254; Link: Ethernet',
  'Connection': 'Keep-Alive',
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate',
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const streamUrl = searchParams.get('url')

    if (!streamUrl) {
      return new Response(JSON.stringify({ error: 'url parameter is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(streamUrl, {
        signal: controller.signal,
        headers: STB_HEADERS,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Upstream returned ${response.status}` }), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const buffer = await response.arrayBuffer()

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId)
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'Stream request timed out' }), {
          status: 504,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }
      throw fetchError
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  })
}
