import { NextRequest, NextResponse } from 'next/server'
import { prisma, hasDatabaseUrl } from '@/lib/prisma'
import { getSessionId } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET — Get paginated results for a job.
 * Query params: ?status=hit&page=1&limit=50
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

    // Verify the job belongs to the session
    const job = await prisma.checkJob.findUnique({
      where: { id },
      select: { id: true, sessionId: true, totalLines: true, processed: true, hits: true, bad: true, timeout: true, status: true },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (job.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Parse query params
    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status') // hit | bad | timeout | null (all)
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200)
    const skip = (page - 1) * limit

    // Build where clause
    const where: Record<string, unknown> = { jobId: id }
    if (statusFilter && ['hit', 'bad', 'timeout'].includes(statusFilter)) {
      where.status = statusFilter
    }

    // Get results and total count
    const [results, total] = await Promise.all([
      prisma.checkResult.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.checkResult.count({ where }),
    ])

    // Parse metadata for each result
    const formattedResults = results.map((r) => {
      let metadata: Record<string, unknown> = {}
      try {
        metadata = JSON.parse(r.metadata)
      } catch {
        // ignore parse errors
      }

      return {
        id: r.id,
        line: r.line,
        status: r.status,
        host: r.host,
        username: r.username,
        password: r.password,
        url: metadata.url || '',
        info: metadata.info || null,
        error: metadata.error || null,
        createdAt: r.createdAt,
      }
    })

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      results: formattedResults,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      jobStats: {
        totalLines: job.totalLines,
        processed: job.processed,
        hits: job.hits,
        bad: job.bad,
        timeout: job.timeout,
        status: job.status,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
