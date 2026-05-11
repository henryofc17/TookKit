import { NextRequest } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — Get full playlist with channels (for reloading)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    const playlist = await prisma.iptvList.findFirst({
      where: { id, sessionId },
    })

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON text fields
    let channels: unknown[] = []
    let groups: string[] = []
    try {
      channels = JSON.parse(playlist.channels)
    } catch { /* empty */ }
    try {
      groups = JSON.parse(playlist.groups)
    } catch { /* empty */ }

    return new Response(JSON.stringify({
      id: playlist.id,
      url: playlist.url,
      name: playlist.name,
      channelCount: playlist.channelCount,
      channels,
      groups,
      createdAt: playlist.createdAt,
      accessedAt: playlist.accessedAt,
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

/**
 * DELETE — Delete a playlist
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params

    // Verify ownership before deleting
    const playlist = await prisma.iptvList.findFirst({
      where: { id, sessionId },
    })

    if (!playlist) {
      return new Response(JSON.stringify({ error: 'Playlist not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await prisma.iptvList.delete({
      where: { id },
    })

    return new Response(JSON.stringify({ success: true }), {
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
