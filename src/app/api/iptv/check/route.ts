import { NextRequest } from 'next/server'
import { checkLine } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST: Process a batch of lines synchronously.
 * Client-driven batch processing — the frontend sends N lines at a time,
 * we process them and return results immediately.
 * This is serverless-safe: no in-memory state, no background tasks.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { lines, inputMode, serverHost, threads } = body as {
      lines: string[]
      inputMode: 'url' | 'combo'
      serverHost?: string
      threads?: number
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return new Response(JSON.stringify({ error: 'No lines provided' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const maxConcurrency = Math.min(threads || 5, 20)
    const results: Array<{
      url: string
      status: 'hit' | 'bad' | 'timeout'
      host?: string
      username?: string
      password?: string
      info?: Record<string, unknown>
    }> = []
    let hits = 0
    let bad = 0
    let timeout = 0

    // Process lines in batches of maxConcurrency
    for (let i = 0; i < lines.length; i += maxConcurrency) {
      const batch = lines.slice(i, Math.min(i + maxConcurrency, lines.length))
      const batchResults = await Promise.all(
        batch.map(async (line) => {
          const trimmedLine = line.trim()
          if (!trimmedLine) return null

          const result = await checkLine(trimmedLine, inputMode, serverHost || '')

          return {
            url: result.url || trimmedLine,
            status: result.status as 'hit' | 'bad' | 'timeout',
            host: result.host,
            username: result.username,
            password: result.password,
            info: result.info,
          }
        })
      )

      for (const r of batchResults) {
        if (!r) continue
        results.push(r)
        if (r.status === 'hit') hits++
        else if (r.status === 'timeout') timeout++
        else bad++
      }
    }

    return new Response(JSON.stringify({
      results,
      stats: { total: results.length, hits, bad, timeout },
    }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
