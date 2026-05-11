import { NextRequest, NextResponse } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — Create a new IPTV check job.
 * Body: { lines: string[], inputMode: "url"|"combo", serverHost?: string, threads?: number }
 */
export async function POST(req: NextRequest) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 401 })
    }

    const body = await req.json()
    const { lines, inputMode, serverHost, threads } = body as {
      lines: string[]
      inputMode: 'url' | 'combo'
      serverHost?: string
      threads?: number
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'No lines provided' }, { status: 400 })
    }

    if (!inputMode || (inputMode !== 'url' && inputMode !== 'combo')) {
      return NextResponse.json({ error: 'inputMode must be "url" or "combo"' }, { status: 400 })
    }

    if (inputMode === 'combo' && !serverHost) {
      return NextResponse.json({ error: 'serverHost is required for combo mode' }, { status: 400 })
    }

    // Upsert session (same pattern as email/create)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.session.upsert({
      where: { id: sessionId },
      update: { lastSeen: new Date(), expiresAt },
      create: { id: sessionId, expiresAt },
    })

    // Filter out empty lines
    const validLines = lines.filter((l) => l.trim().length > 0)

    if (validLines.length === 0) {
      return NextResponse.json({ error: 'No valid lines provided' }, { status: 400 })
    }

    // Create the CheckJob
    const job = await prisma.checkJob.create({
      data: {
        sessionId,
        inputMode,
        serverHost: serverHost || '',
        totalLines: validLines.length,
        status: 'running',
        pendingLines: JSON.stringify(validLines),
        processed: 0,
        hits: 0,
        bad: 0,
        timeout: 0,
      },
    })

    return NextResponse.json({
      id: job.id,
      sessionId: job.sessionId,
      inputMode: job.inputMode,
      serverHost: job.serverHost,
      status: job.status,
      totalLines: job.totalLines,
      processed: job.processed,
      hits: job.hits,
      bad: job.bad,
      timeout: job.timeout,
      createdAt: job.createdAt,
    }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET — List active (running) jobs for the session.
 */
export async function GET(req: NextRequest) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 401 })
    }

    const jobs = await prisma.checkJob.findMany({
      where: {
        sessionId,
        status: 'running',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sessionId: true,
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
    })

    // Add progress percentage
    const jobsWithProgress = jobs.map((job) => ({
      ...job,
      progress: job.totalLines > 0 ? Math.round((job.processed / job.totalLines) * 100) : 0,
    }))

    return NextResponse.json({ jobs: jobsWithProgress })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
