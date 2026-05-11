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
 * - Both double-quoted and single-quoted URI values
 */
function rewriteM3U8Urls(content: string, manifestUrl: string): string {
  // Normalize line endings first
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const lines = normalized.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." and URI='...' attributes inside tags
      let rewritten = line.replace(/URI="([^"]+)"/g, (_match, url: string) => {
        const absoluteUrl = resolveUrl(url, manifestUrl)
        return `URI="${buildProxyUrl(absoluteUrl)}"`
      })
      // Also handle single-quoted URI values
      rewritten = rewritten.replace(/URI='([^']+)'/g, (_match, url: string) => {
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
 * Check if content is an HLS/M3U8 manifest by inspecting the actual content.
 * This is the most reliable way — URL-based detection is error-prone because
 * individual stream URLs may contain "m3u" or "get.php" in their path.
 */
function isHLSManifestContent(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFEFF/, '') // Remove BOM
  // HLS manifests always start with #EXTM3U and contain #EXT-X- tags
  return trimmed.startsWith('#EXTM3U') && trimmed.includes('#EXT-X-')
}

/**
 * Check if content is a simple M3U/M3U Plus playlist (channel list, not HLS).
 * These should NOT be processed by the stream proxy — they should be loaded
 * through the /api/iptv/playlist endpoint instead.
 */
function isM3UPlaylist(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFEFF/, '')
  // M3U playlists start with #EXTM3U but use #EXTINF (not #EXT-X-)
  return trimmed.startsWith('#EXTM3U') && !trimmed.includes('#EXT-X-')
}

/**
 * Quick URL-based hint that this might be an M3U8 manifest.
 * Used to decide whether to read the body as text for content inspection.
 * This is NOT the final decision — content inspection is the authority.
 */
function mightBeManifest(url: string, contentType: string): boolean {
  const ct = contentType.toLowerCase()
  // Definitive content-type indicators
  if (
    ct.includes('mpegurl') ||
    ct.includes('mpeg-url') ||
    ct.includes('vnd.apple.mpegurl') ||
    ct.includes('audio/mpegurl')
  ) {
    return true
  }
  // Also check text/plain — many IPTV servers return M3U8 with text/plain content-type
  if (ct.includes('text/plain') || ct.includes('text/html') || ct.includes('application/octet-stream')) {
    // For these generic types, check the URL for M3U8 hints
    if (url.includes('.m3u8') || url.includes('.m3u')) return true
  }
  // URL hints
  if (url.includes('.m3u8')) return true
  return false
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
    // 30s timeout for initial connection — some IPTV servers are slow
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

      // Strategy: If the URL or content-type suggests it might be a manifest,
      // read the body as text and inspect the actual content.
      // Otherwise, stream directly (video segment, TS file, etc.)
      if (mightBeManifest(streamUrl, contentType)) {
        const text = await response.text()

        // Case 1: It's a real HLS manifest — rewrite URLs and serve
        if (isHLSManifestContent(text)) {
          const rewritten = rewriteM3U8Urls(text, streamUrl)
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

        // Case 2: It's an M3U playlist (channel list), not an HLS manifest.
        // Return it as-is so the player can parse it.
        // The /api/iptv/playlist endpoint is the proper way to load these,
        // but if a user pastes a playlist URL directly into the player,
        // we should still serve it properly.
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

        // Case 3: URL/content-type suggested manifest, but content isn't M3U at all.
        // This could be a video segment with a misleading content-type.
        // Try streaming it directly.
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

      // Not a manifest candidate — stream directly (video segments, TS files, etc.)
      // This is the common path for individual channel stream URLs.
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
