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
    // 30s timeout — some IPTV portals are slow to generate large playlists
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: STB_HEADERS,
        redirect: 'follow',
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

    // Parse M3U/M3U Plus — robust single-pass parser with edge case handling
    const channels: Array<{
      name: string
      url: string
      logo: string
      group: string
      tvgId: string
    }> = []

    const groupSet = new Set<string>()

    // Normalize line endings: remove BOM, convert CRLF to LF
    const normalizedText = text
      .replace(/^\uFEFF/, '')           // Remove UTF-8 BOM
      .replace(/\u0000/g, '')           // Remove null bytes
      .replace(/\r\n/g, '\n')           // CRLF → LF
      .replace(/\r/g, '\n')             // Remaining CR → LF

    const lines = normalizedText.split('\n')
    let currentInfo: { name: string; logo: string; group: string; tvgId: string } | null = null
    let currentGroup = ''  // Track group from #EXTGRP tags

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (!line) continue  // Skip empty lines

      if (line.startsWith('#EXTINF:')) {
        // Parse attributes — fast regex, support both double and single quotes
        const tvgIdMatch = line.match(/tvg-id=["']([^"']*)["']/)
        const tvgLogoMatch = line.match(/tvg-logo=["']([^"']*)["']/)
        const groupMatch = line.match(/group-title=["']([^"']*)["']/)

        // Channel name is after the last comma
        const commaIdx = line.lastIndexOf(',')
        const name = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Sin Nombre'

        // group-title takes priority, then #EXTGRP, then default
        const group = groupMatch?.[1] || currentGroup || 'Sin Categoría'

        currentInfo = {
          name: name || 'Sin Nombre',
          logo: tvgLogoMatch?.[1] || '',
          group,
          tvgId: tvgIdMatch?.[1] || '',
        }
        // Track groups as we go — avoids a second pass
        groupSet.add(group)
      } else if (line.startsWith('#EXTGRP:')) {
        // #EXTGRP tag sets the group for the next channel
        // Some playlists use this instead of group-title in #EXTINF
        currentGroup = line.substring(8).trim()
      } else if (line.startsWith('#EXTVLCOPT:') || line.startsWith('#EXTALBVNLIMIT:') || line.startsWith('#EXTBYTETARGET:')) {
        // Skip VLC-specific and other metadata tags between #EXTINF and URL
        continue
      } else if (line.startsWith('#EXTM3U')) {
        // Header line — skip
        continue
      } else if (line.startsWith('#')) {
        // Other comments/tags — skip but don't reset currentInfo
        continue
      } else if (currentInfo) {
        // This is the stream URL following an #EXTINF
        // Some playlists have URLs with leading/trailing spaces or weird chars
        const cleanUrl = line.replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '')
        if (cleanUrl) {
          channels.push({
            ...currentInfo,
            url: cleanUrl,
          })
        }
        currentInfo = null
        currentGroup = ''
      } else if (line.startsWith('http')) {
        // URL without preceding #EXTINF — some malformed playlists do this
        const cleanUrl = line.replace(/\s+/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '')
        if (cleanUrl) {
          channels.push({
            name: `Canal ${channels.length + 1}`,
            url: cleanUrl,
            logo: '',
            group: currentGroup || 'Sin Categoría',
            tvgId: '',
          })
          groupSet.add(currentGroup || 'Sin Categoría')
          currentGroup = ''
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

      // Check if the response looks like HTML (error page, redirect page, etc.)
      const trimmedText = text.trim()
      if (trimmedText.startsWith('<!DOCTYPE') || trimmedText.startsWith('<html') || trimmedText.startsWith('<HTML')) {
        return new Response(JSON.stringify({
          error: 'La URL devolvió una página web, no una lista M3U. Verifica que la URL sea correcta.',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Check if response looks like JSON (some APIs return errors as JSON)
      if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
        try {
          const jsonData = JSON.parse(trimmedText)
          const errorMsg = jsonData.error || jsonData.message || jsonData.msg || JSON.stringify(jsonData).substring(0, 200)
          return new Response(JSON.stringify({
            error: `La URL devolvió un error: ${errorMsg}`,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch {
          // Not valid JSON, fall through
        }
      }

      return new Response(JSON.stringify({
        error: 'No se encontraron canales en la lista. Verifica que la URL sea correcta y sea una lista M3U/M3U8 válida.',
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
