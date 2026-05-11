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
 * GET — List favorites for session
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

    const favorites = await prisma.favorite.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    })

    return new Response(JSON.stringify({ favorites }), {
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
 * POST — Add favorite
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
    const { channelName, channelUrl, channelLogo, channelGroup } = body as {
      channelName: string
      channelUrl: string
      channelLogo?: string
      channelGroup?: string
    }

    if (!channelName || !channelUrl) {
      return new Response(JSON.stringify({ error: 'channelName and channelUrl are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await ensureSession(sessionId)

    // Use upsert on the unique constraint (sessionId + channelUrl)
    const favorite = await prisma.favorite.upsert({
      where: {
        sessionId_channelUrl: {
          sessionId,
          channelUrl,
        },
      },
      update: {
        channelName,
        channelLogo: channelLogo || '',
        channelGroup: channelGroup || '',
      },
      create: {
        sessionId,
        channelName,
        channelUrl,
        channelLogo: channelLogo || '',
        channelGroup: channelGroup || '',
      },
    })

    return new Response(JSON.stringify({
      id: favorite.id,
      channelName: favorite.channelName,
      channelUrl: favorite.channelUrl,
      channelLogo: favorite.channelLogo,
      channelGroup: favorite.channelGroup,
      createdAt: favorite.createdAt,
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
 * DELETE — Remove favorite
 */
export async function DELETE(req: NextRequest) {
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
    const { channelUrl } = body as { channelUrl: string }

    if (!channelUrl) {
      return new Response(JSON.stringify({ error: 'channelUrl is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Find and delete — must match sessionId + channelUrl for ownership
    const favorite = await prisma.favorite.findUnique({
      where: {
        sessionId_channelUrl: {
          sessionId,
          channelUrl,
        },
      },
    })

    if (!favorite) {
      return new Response(JSON.stringify({ error: 'Favorite not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    await prisma.favorite.delete({
      where: { id: favorite.id },
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
