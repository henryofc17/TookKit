import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/email/recover
 * Recover the user's active email from the database using their session ID.
 * Falls back gracefully if no database is configured.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.headers.get('x-session-id')

    if (!sessionId) {
      return NextResponse.json({ error: 'No session found' }, { status: 400 })
    }

    // Try to use database if available
    try {
      const { prisma, hasDatabaseUrl } = await import('@/lib/prisma')
      
      if (hasDatabaseUrl) {
        const email = await prisma.tempEmail.findFirst({
          where: {
            sessionId,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        })

        if (email) {
          return NextResponse.json({
            address: email.address,
            token: email.token,
            id: email.accountId,
            provider: email.provider,
          })
        }
      }
    } catch {
      // Database not available or not configured — return no recovery
    }

    return NextResponse.json({ email: null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
