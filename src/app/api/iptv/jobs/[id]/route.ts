import { NextRequest, NextResponse } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET — Get job details + progress.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 401 })
    }

    const { id } = await context.params
    const job = await prisma.checkJob.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const progress = job.totalLines > 0 ? Math.round((job.processed / job.totalLines) * 100) : 0
    const remainingLines = job.totalLines - job.processed

    // Parse pending lines count without loading the full JSON
    let pendingCount = 0
    try {
      const parsed = JSON.parse(job.pendingLines)
      pendingCount = Array.isArray(parsed) ? parsed.length : 0
    } catch {
      pendingCount = remainingLines
    }

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
      pendingCount,
      progress,
      remainingLines,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH — Cancel or pause a job.
 * Body: { action: "cancel" | "pause" }
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 401 })
    }

    const { id } = await context.params
    const job = await prisma.checkJob.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { action } = body as { action: string }

    if (action !== 'cancel' && action !== 'pause') {
      return NextResponse.json({ error: 'action must be "cancel" or "pause"' }, { status: 400 })
    }

    if (job.status !== 'running') {
      return NextResponse.json({
        error: `Job is already ${job.status}`,
        status: job.status,
      }, { status: 409 })
    }

    const newStatus = action === 'cancel' ? 'cancelled' : 'paused'
    const updateData: Record<string, unknown> = { status: newStatus }

    // If cancelling, set completedAt
    if (action === 'cancel') {
      updateData.completedAt = new Date()
    }

    const updated = await prisma.checkJob.update({
      where: { id },
      data: updateData,
    })

    const progress = updated.totalLines > 0
      ? Math.round((updated.processed / updated.totalLines) * 100)
      : 0

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      processed: updated.processed,
      hits: updated.hits,
      bad: updated.bad,
      timeout: updated.timeout,
      progress,
      completedAt: updated.completedAt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
