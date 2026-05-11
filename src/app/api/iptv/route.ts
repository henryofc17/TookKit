import { NextRequest } from 'next/server'
import { checkLine } from '@/lib/iptv-shared'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST: Check a single IPTV line (URL or combo format).
 * Backward-compatible endpoint — delegates to the shared checkLine utility.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { url, host: hostInput, combo } = body

    let inputMode: 'url' | 'combo'
    let line: string
    let serverHost = ''

    if (combo && hostInput) {
      inputMode = 'combo'
      line = combo
      serverHost = hostInput
    } else if (url && typeof url === 'string') {
      inputMode = 'url'
      line = url
    } else {
      return new Response(JSON.stringify({ error: 'URL or combo+host is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const result = await checkLine(line, inputMode, serverHost)

    // For backward compatibility, the original route returns 200 for all results
    return new Response(JSON.stringify(result), {
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
