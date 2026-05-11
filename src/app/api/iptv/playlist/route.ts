import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 4 rev: 2721 Mobile Safari/533.3',
        'Accept': '*/*',
        'Connection': 'Keep-Alive',
      },
    })

    clearTimeout(timeoutId)

    const text = await response.text()

    // Parse M3U/M3U Plus
    const channels: Array<{
      name: string
      url: string
      logo: string
      group: string
      tvgId: string
    }> = []

    const lines = text.split('\n')
    let currentInfo: { name: string; logo: string; group: string; tvgId: string } | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      if (line.startsWith('#EXTINF:')) {
        // Parse attributes
        const tvgIdMatch = line.match(/tvg-id="([^"]*)"/)
        const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/)
        const groupMatch = line.match(/group-title="([^"]*)"/)

        // Channel name is after the last comma
        const commaIdx = line.lastIndexOf(',')
        const name = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Sin Nombre'

        currentInfo = {
          name: name || 'Sin Nombre',
          logo: tvgLogoMatch?.[1] || '',
          group: groupMatch?.[1] || 'Sin Categoría',
          tvgId: tvgIdMatch?.[1] || '',
        }
      } else if (line && !line.startsWith('#') && currentInfo) {
        // This is the stream URL
        channels.push({
          ...currentInfo,
          url: line,
        })
        currentInfo = null
      }
    }

    // Extract unique groups
    const groups = [...new Set(channels.map(c => c.group))].sort()

    return new Response(JSON.stringify({
      total: channels.length,
      groups,
      channels,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
