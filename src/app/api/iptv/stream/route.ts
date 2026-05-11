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

/**
 * Resolve a potentially relative URL against a base URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href
  } catch {
    return url
  }
}

/**
 * Build a proxy URL for the given absolute URL
 */
function buildProxyUrl(url: string): string {
  return `/api/iptv/stream?url=${encodeURIComponent(url)}`
}

/**
 * Rewrite all URLs in an M3U8 manifest to go through our proxy.
 * Handles:
 * - Stream URLs (lines without # prefix)
 * - URI attributes in tags like #EXT-X-KEY, #EXT-X-MEDIA, etc.
 */
function rewriteM3U8Urls(content: string, manifestUrl: string): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." attributes inside tags
      const rewritten = line.replace(/URI="([^"]+)"/g, (_match, url: string) => {
        const absoluteUrl = resolveUrl(url, manifestUrl)
        return `URI="${buildProxyUrl(absoluteUrl)}"`
      })
      result.push(rewritten)
    } else if (trimmed) {
      // This is a stream URL — rewrite it through the proxy
      const absoluteUrl = resolveUrl(trimmed, manifestUrl)
      result.push(buildProxyUrl(absoluteUrl))
    } else {
      // Empty line
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Check if a URL or content-type indicates an M3U8 manifest
 */
function isM3U8(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase()
  return (
    ct.includes('mpegurl') ||
    ct.includes('mpeg-url') ||
    ct.includes('vnd.apple.mpegurl') ||
    url.includes('.m3u8') ||
    url.includes('m3u_plus') ||
    url.includes('/get.php') ||
    url.includes('type=m3u')
  )
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
    // Shorter timeout for faster failure — 15s for segments, 20s for manifests
    const timeoutId = setTimeout(() => controller.abort(), 20000)

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

      // If this is an M3U8 manifest, rewrite URLs to go through our proxy
      if (isM3U8(streamUrl, contentType)) {
        const text = await response.text()

        // Rewrite all URLs in the manifest to use our proxy
        const rewritten = rewriteM3U8Urls(text, streamUrl)

        return new Response(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            // No cache for live manifests — they update frequently
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        })
      }

      // For video segments and other content — stream directly without buffering
      // This avoids loading large segments entirely into memory
      if (response.body) {
        return new Response(response.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            // Cache video segments for 5 minutes — they never change
            'Cache-Control': 'public, max-age=300',
          },
        })
      }

      // Fallback: buffer only if no readable stream
      const buffer = await response.arrayBuffer()
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=300',
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
