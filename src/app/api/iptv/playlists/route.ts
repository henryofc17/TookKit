import { NextRequest } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Helper: ensure session exists in DB (upsert pattern)
 */
async function ensureSession(sessionId: string) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await prisma.session.upsert({
    where: { id: sessionId },
    update: { lastSeen: new Date(), expiresAt },
    create: { id: sessionId, expiresAt },
  })
}

/**
 * Derive a human-readable name from a URL
 */
function deriveNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname
    // Try to get a meaningful name from the path
    const pathParts = parsed.pathname.split('/').filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1] || ''
    if (lastPart && lastPart !== 'get.php' && lastPart !== 'player_api.php') {
      return `${hostname} - ${lastPart}`
    }
    return hostname
  } catch {
    return 'Untitled Playlist'
  }
}

/**
 * POST — Save a playlist
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabaseUrl) {
      return new Response(JSON.stringify({ error: 'Database not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { url, name, channels, groups } = body as {
      url: string
      name?: string
      channels: Array<{ name: string; url: string; logo: string; group: string; tvgId: string }>
      groups: string[]
    }

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!channels || !Array.isArray(channels)) {
      return new Response(JSON.stringify({ error: 'Channels array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await ensureSession(sessionId)

    const playlistName = name || deriveNameFromUrl(url)

    const playlist = await prisma.iptvList.create({
      data: {
        sessionId,
        url,
        name: playlistName,
        channelCount: channels.length,
        groups: JSON.stringify(groups || []),
        channels: JSON.stringify(channels),
      },
    })

    return new Response(JSON.stringify({
      id: playlist.id,
      url: playlist.url,
      name: playlist.name,
      channelCount: playlist.channelCount,
      createdAt: playlist.createdAt,
      accessedAt: playlist.accessedAt,
    }), {
      status: 201,
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

/**
 * GET — List playlists for session
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabaseUrl) {
      return new Response(JSON.stringify({ error: 'Database not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'Session ID required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const playlists = await prisma.iptvList.findMany({
      where: { sessionId },
      orderBy: { accessedAt: 'desc' },
      select: {
        id: true,
        url: true,
        name: true,
        channelCount: true,
        accessedAt: true,
      },
    })

    return new Response(JSON.stringify({ playlists }), {
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
