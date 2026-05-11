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
 * GET — Get current player state for session
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

    const state = await prisma.playerState.findUnique({
      where: { sessionId },
    })

    if (!state) {
      return new Response(JSON.stringify({ state: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Parse JSON text field
    let currentChannel: unknown = null
    try {
      currentChannel = JSON.parse(state.currentChannel)
    } catch { /* empty */ }

    return new Response(JSON.stringify({
      state: {
        id: state.id,
        playlistUrl: state.playlistUrl,
        currentChannel,
        selectedGroup: state.selectedGroup,
        volume: state.volume,
        isMuted: state.isMuted,
        useProxy: state.useProxy,
        updatedAt: state.updatedAt,
      },
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
 * PUT — Save player state (upsert on sessionId unique constraint)
 */
export async function PUT(req: NextRequest) {
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
    const {
      playlistUrl,
      currentChannel,
      selectedGroup,
      volume,
      isMuted,
      useProxy,
    } = body as {
      playlistUrl?: string
      currentChannel?: { name: string; url: string; logo: string; group: string }
      selectedGroup?: string
      volume?: number
      isMuted?: boolean
      useProxy?: boolean
    }

    await ensureSession(sessionId)

    const state = await prisma.playerState.upsert({
      where: { sessionId },
      update: {
        playlistUrl: playlistUrl ?? '',
        currentChannel: JSON.stringify(currentChannel || {}),
        selectedGroup: selectedGroup ?? 'all',
        volume: volume ?? 0.8,
        isMuted: isMuted ?? false,
        useProxy: useProxy ?? false,
      },
      create: {
        sessionId,
        playlistUrl: playlistUrl ?? '',
        currentChannel: JSON.stringify(currentChannel || {}),
        selectedGroup: selectedGroup ?? 'all',
        volume: volume ?? 0.8,
        isMuted: isMuted ?? false,
        useProxy: useProxy ?? false,
      },
    })

    // Parse back for response
    let parsedChannel: unknown = null
    try {
      parsedChannel = JSON.parse(state.currentChannel)
    } catch { /* empty */ }

    return new Response(JSON.stringify({
      state: {
        id: state.id,
        playlistUrl: state.playlistUrl,
        currentChannel: parsedChannel,
        selectedGroup: state.selectedGroup,
        volume: state.volume,
        isMuted: state.isMuted,
        useProxy: state.useProxy,
        updatedAt: state.updatedAt,
      },
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
