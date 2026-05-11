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
 * GET — List recent watch history (last 50, ordered by watchedAt desc)
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

    const history = await prisma.watchHistory.findMany({
      where: { sessionId },
      orderBy: { watchedAt: 'desc' },
      take: 50,
    })

    return new Response(JSON.stringify({ history }), {
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
 * POST — Add/Update watch history
 * Upsert: if same channelUrl exists in last 24h, update watchedAt; otherwise create new
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

    // Check if the same channel was watched in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentEntry = await prisma.watchHistory.findFirst({
      where: {
        sessionId,
        channelUrl,
        watchedAt: { gte: twentyFourHoursAgo },
      },
      orderBy: { watchedAt: 'desc' },
    })

    let entry
    if (recentEntry) {
      // Update the existing entry's watchedAt timestamp
      entry = await prisma.watchHistory.update({
        where: { id: recentEntry.id },
        data: {
          watchedAt: new Date(),
          channelName,
          channelLogo: channelLogo || '',
          channelGroup: channelGroup || '',
        },
      })
    } else {
      // Create a new entry
      entry = await prisma.watchHistory.create({
        data: {
          sessionId,
          channelName,
          channelUrl,
          channelLogo: channelLogo || '',
          channelGroup: channelGroup || '',
        },
      })
    }

    return new Response(JSON.stringify({
      id: entry.id,
      channelName: entry.channelName,
      channelUrl: entry.channelUrl,
      channelLogo: entry.channelLogo,
      channelGroup: entry.channelGroup,
      watchedAt: entry.watchedAt,
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
