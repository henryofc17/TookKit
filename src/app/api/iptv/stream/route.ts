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
 * Rewrite M3U8 manifest URLs to be DIRECT (not proxied).
 * Segment URLs and key URLs are left as absolute direct URLs
 * so the browser loads them directly without going through our proxy.
 * This drastically reduces Vercel serverless invocations.
 */
function rewriteM3U8DirectUrls(content: string, manifestUrl: string): string {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." attributes to absolute direct URLs
      let rewritten = line.replace(/URI="([^"]+)"/g, (_match, url: string) => {
        const absoluteUrl = resolveUrl(url, manifestUrl)
        return `URI="${absoluteUrl}"`
      })
      rewritten = rewritten.replace(/URI='([^']+)'/g, (_match, url: string) => {
        const absoluteUrl = resolveUrl(url, manifestUrl)
        return `URI="${absoluteUrl}"`
      })
      result.push(rewritten)
    } else if (trimmed) {
      // Stream/segment URL — resolve to absolute but do NOT proxy
      const absoluteUrl = resolveUrl(trimmed, manifestUrl)
      result.push(absoluteUrl)
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Check if content is an HLS/M3U8 manifest by inspecting the actual content.
 */
function isHLSManifestContent(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  return trimmed.startsWith('#EXTM3U') && trimmed.includes('#EXT-X-')
}

/**
 * Check if content is a simple M3U/M3U Plus playlist (channel list, not HLS).
 */
function isM3UPlaylist(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  return trimmed.startsWith('#EXTM3U') && !trimmed.includes('#EXT-X-')
}

/**
 * Quick URL-based hint that this might be an M3U8 manifest.
 */
function mightBeManifest(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase()
  if (
    ct.includes('mpegurl') ||
    ct.includes('mpeg-url') ||
    ct.includes('vnd.apple.mpegurl') ||
    ct.includes('audio/mpegurl')
  ) {
    return true
  }
  if (ct.includes('text/plain') || ct.includes('text/html') || ct.includes('application/octet-stream')) {
    if (url.includes('.m3u8') || url.includes('.m3u')) return true
  }
  if (url.includes('.m3u8')) return true
  return false
}

/**
 * Stream proxy — ONLY used for M3U8 manifests that are CORS-blocked.
 * Segment URLs in the manifest are rewritten to be direct (not proxied).
 * This means only the small manifest text goes through Vercel, 
 * not the actual video data.
 * 
 * Frontend should try loading streams DIRECTLY first.
 * Only fall back to this proxy when CORS blocks the manifest.
 */
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
        redirect: 'follow',
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

      // If this might be a manifest, read body as text and inspect
      if (mightBeManifest(streamUrl, contentType)) {
        const text = await response.text()

        // Case 1: Real HLS manifest — rewrite URLs to be DIRECT (not proxied)
        // This is the key change: segments go directly to the IPTV server,
        // only the manifest text passes through our proxy
        if (isHLSManifestContent(text)) {
          const rewritten = rewriteM3U8DirectUrls(text, streamUrl)
          return new Response(rewritten, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          })
        }

        // Case 2: M3U playlist (channel list) — return as-is
        if (isM3UPlaylist(text)) {
          return new Response(text, {
            status: 200,
            headers: {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Cache-Control': 'no-cache',
            },
          })
        }

        // Case 3: Not actually M3U — stream directly
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=300',
          },
        })
      }

      // Not a manifest candidate — stream directly
      if (response.body) {
        return new Response(response.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=300',
          },
        })
      }

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
