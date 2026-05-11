import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STB_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
  'Accept': '*/*',
  'Connection': 'Keep-Alive',
  'Accept-Encoding': 'gzip, deflate',
  'Cookie': 'stb_lang=en; timezone=Europe%2FIstanbul;',
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const controller = new AbortController()
    // 20s timeout — some IPTV portals are slow to generate playlists
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: STB_HEADERS,
      })
      clearTimeout(timeoutId)
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return new Response(JSON.stringify({ error: 'La lista tardó demasiado en responder. Intenta de nuevo.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'No se pudo conectar al servidor de la lista' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Error del servidor: ${response.status} ${response.statusText}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const text = await response.text()

    // Parse M3U/M3U Plus — optimized single-pass parser
    const channels: Array<{
      name: string
      url: string
      logo: string
      group: string
      tvgId: string
    }> = []

    const groupSet = new Set<string>()
    const lines = text.split('\n')
    let currentInfo: { name: string; logo: string; group: string; tvgId: string } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line.startsWith('#EXTINF:')) {
        // Parse attributes — fast regex
        const tvgIdMatch = line.match(/tvg-id="([^"]*)"/)
        const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/)
        const groupMatch = line.match(/group-title="([^"]*)"/)

        // Channel name is after the last comma
        const commaIdx = line.lastIndexOf(',')
        const name = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Sin Nombre'

        const group = groupMatch?.[1] || 'Sin Categoría'

        currentInfo = {
          name: name || 'Sin Nombre',
          logo: tvgLogoMatch?.[1] || '',
          group,
          tvgId: tvgIdMatch?.[1] || '',
        }
        // Track groups as we go — avoids a second pass
        groupSet.add(group)
      } else if (line && !line.startsWith('#') && currentInfo) {
        // This is the stream URL
        channels.push({
          ...currentInfo,
          url: line,
        })
        currentInfo = null
      } else if (line && !line.startsWith('#') && !currentInfo) {
        // URL without preceding #EXTINF — some malformed playlists do this
        // Only add if it looks like a URL
        if (line.startsWith('http') && channels.length === 0) {
          channels.push({
            name: `Canal ${channels.length + 1}`,
            url: line,
            logo: '',
            group: 'Sin Categoría',
            tvgId: '',
          })
          groupSet.add('Sin Categoría')
        }
      }
    }

    // If no channels were parsed, the file might not be a valid M3U
    if (channels.length === 0) {
      // Check if it looks like an HLS manifest (not a channel list)
      if (text.includes('#EXT-X-')) {
        return new Response(JSON.stringify({
          error: 'Esta URL es un stream HLS, no una lista de canales. Usa la URL directamente en el reproductor.',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        error: 'No se encontraron canales en la lista. Verifica que la URL sea correcta.',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Convert group set to sorted array
    const groups = [...groupSet].sort()

    return new Response(JSON.stringify({
      total: channels.length,
      groups,
      channels,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 5 minutes on the client to avoid re-fetching the same list
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: `Error inesperado: ${message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
