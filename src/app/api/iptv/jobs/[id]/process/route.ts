import { NextRequest, NextResponse } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { checkLine, getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST — Process the next batch of lines for a job.
 * The frontend polls this to advance the job.
 * Body: { threads?: number }  (optional override, default 5, max 20)
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!hasDatabaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const sessionId = getSessionId(req)
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing x-session-id header' }, { status: 401 })
    }

    const { id } = await context.params

    // Find the job with a row-level check
    const job = await prisma.checkJob.findUnique({
      where: { id },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // If job is not running, return its current status
    if (job.status !== 'running') {
      const progress = job.totalLines > 0
        ? Math.round((job.processed / job.totalLines) * 100)
        : 0
      return NextResponse.json({
        status: job.status,
        message: `Job is ${job.status}`,
        processed: job.processed,
        hits: job.hits,
        bad: job.bad,
        timeout: job.timeout,
        totalLines: job.totalLines,
        progress,
        results: [],
      })
    }

    // Parse the body for optional threads override
    let threads = 5
    try {
      const body = await req.json()
      if (body.threads && typeof body.threads === 'number') {
        threads = Math.min(Math.max(body.threads, 1), 20)
      }
    } catch {
      // Empty body is fine, use default threads
    }

    // Parse pending lines
    let pendingLines: string[]
    try {
      const parsed = JSON.parse(job.pendingLines)
      pendingLines = Array.isArray(parsed) ? parsed : []
    } catch {
      return NextResponse.json({ error: 'Corrupted job data' }, { status: 500 })
    }

    // No more lines to process — mark as completed
    if (pendingLines.length === 0) {
      const updated = await prisma.checkJob.update({
        where: { id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      })
      return NextResponse.json({
        status: 'completed',
        processed: updated.processed,
        hits: updated.hits,
        bad: updated.bad,
        timeout: updated.timeout,
        totalLines: updated.totalLines,
        progress: 100,
        results: [],
      })
    }

    // Take the next batch
    const batch = pendingLines.slice(0, threads)
    const remainingLines = pendingLines.slice(threads)

    // Process the batch concurrently
    const batchResults = await Promise.all(
      batch.map(async (line) => {
        const trimmedLine = line.trim()
        if (!trimmedLine) return null

        const result = await checkLine(trimmedLine, job.inputMode as 'url' | 'combo', job.serverHost)

        return {
          line: trimmedLine,
          ...result,
        }
      })
    )

    // Filter nulls and compute stats
    const validResults = batchResults.filter((r): r is NonNullable<typeof r> => r !== null)
    let hitsDelta = 0
    let badDelta = 0
    let timeoutDelta = 0

    // Create CheckResult records and count stats
    const createPromises = validResults.map((result) => {
      if (result.status === 'hit') hitsDelta++
      else if (result.status === 'timeout') timeoutDelta++
      else badDelta++

      return prisma.checkResult.create({
        data: {
          jobId: id,
          line: result.line,
          status: result.status,
          host: result.host || '',
          username: result.username || '',
          password: result.password || '',
          metadata: JSON.stringify({
            url: result.url,
            info: result.info,
            error: result.error,
          }),
        },
      })
    })

    await Promise.all(createPromises)

    // Determine if this batch completes the job
    const isCompleted = remainingLines.length === 0

    // Update the job atomically — use atomic increment to handle concurrent calls safely
    const updatedJob = await prisma.checkJob.update({
      where: { id },
      data: {
        pendingLines: JSON.stringify(remainingLines),
        processed: { increment: validResults.length },
        hits: { increment: hitsDelta },
        bad: { increment: badDelta },
        timeout: { increment: timeoutDelta },
        ...(isCompleted ? { status: 'completed', completedAt: new Date() } : {}),
      },
    })

    const progress = updatedJob.totalLines > 0
      ? Math.round((updatedJob.processed / updatedJob.totalLines) * 100)
      : 0

    // Format batch results for response
    const formattedResults = validResults.map((r) => ({
      line: r.line,
      status: r.status,
      host: r.host,
      username: r.username,
      password: r.password,
      url: r.url,
      info: r.info,
      error: r.error,
    }))

    return NextResponse.json({
      status: updatedJob.status,
      processed: updatedJob.processed,
      hits: updatedJob.hits,
      bad: updatedJob.bad,
      timeout: updatedJob.timeout,
      totalLines: updatedJob.totalLines,
      pendingCount: remainingLines.length,
      progress,
      results: formattedResults,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
