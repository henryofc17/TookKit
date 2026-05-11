import { NextRequest } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — Full state recovery for session resume
 * Returns ALL state needed to restore the user's session on page load.
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

    // Run all queries in parallel for efficiency
    const [activeJobs, playlists, favorites, recentHistory, playerState] = await Promise.all([
      // Running CheckJobs with stats
      prisma.checkJob.findMany({
        where: {
          sessionId,
          status: { in: ['running', 'paused'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          inputMode: true,
          serverHost: true,
          status: true,
          totalLines: true,
          processed: true,
          hits: true,
          bad: true,
          timeout: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      // Saved playlists (metadata only)
      prisma.iptvList.findMany({
        where: { sessionId },
        orderBy: { accessedAt: 'desc' },
        select: {
          id: true,
          url: true,
          name: true,
          channelCount: true,
          accessedAt: true,
        },
      }),

      // Favorite channels
      prisma.favorite.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
      }),

      // Recent watch history (last 50)
      prisma.watchHistory.findMany({
        where: { sessionId },
        orderBy: { watchedAt: 'desc' },
        take: 50,
      }),

      // Last player state
      prisma.playerState.findUnique({
        where: { sessionId },
      }),
    ])

    // Parse player state JSON fields
    let parsedPlayerState: {
      id: string
      playlistUrl: string
      currentChannel: unknown
      selectedGroup: string
      volume: number
      isMuted: boolean
      useProxy: boolean
      updatedAt: Date
    } | null = null
    let playlistUrl = ''

    if (playerState) {
      let currentChannel: unknown = null
      try {
        currentChannel = JSON.parse(playerState.currentChannel)
      } catch { /* empty */ }

      parsedPlayerState = {
        id: playerState.id,
        playlistUrl: playerState.playlistUrl,
        currentChannel,
        selectedGroup: playerState.selectedGroup,
        volume: playerState.volume,
        isMuted: playerState.isMuted,
        useProxy: playerState.useProxy,
        updatedAt: playerState.updatedAt,
      }
      playlistUrl = playerState.playlistUrl
    }

    // Fetch last-used playlist full data if playerState has a playlistUrl
    let lastPlaylist: {
      id: string
      url: string
      name: string
      channelCount: number
      channels: unknown[]
      groups: string[]
      createdAt: Date
      accessedAt: Date
    } | null = null
    if (playlistUrl) {
      const lastPlaylistRecord = await prisma.iptvList.findFirst({
        where: {
          sessionId,
          url: playlistUrl,
        },
        orderBy: { accessedAt: 'desc' },
      })

      if (lastPlaylistRecord) {
        let channels: unknown[] = []
        let groups: string[] = []
        try {
          channels = JSON.parse(lastPlaylistRecord.channels)
        } catch { /* empty */ }
        try {
          groups = JSON.parse(lastPlaylistRecord.groups)
        } catch { /* empty */ }

        lastPlaylist = {
          id: lastPlaylistRecord.id,
          url: lastPlaylistRecord.url,
          name: lastPlaylistRecord.name,
          channelCount: lastPlaylistRecord.channelCount,
          channels,
          groups,
          createdAt: lastPlaylistRecord.createdAt,
          accessedAt: lastPlaylistRecord.accessedAt,
        }
      }
    }

    return new Response(JSON.stringify({
      activeJobs,
      playlists,
      favorites,
      recentHistory,
      playerState: parsedPlayerState,
      lastPlaylist,
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
