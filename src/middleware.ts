import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'toolkit_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export function middleware(req: NextRequest) {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value

  // If no session cookie, create one
  if (!sessionId) {
    const newSessionId = crypto.randomUUID()
    const response = NextResponse.next()
    response.cookies.set(SESSION_COOKIE, newSessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    })
    // Also set as a header so API routes can read it
    response.headers.set('x-session-id', newSessionId)
    return response
  }

  // Session exists — pass it as a header for API routes
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-session-id', sessionId)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon-*, android-chrome-*, apple-touch-icon, logo.*, robots.txt
     */
    '/((?!_next/static|_next/image|favicon\\.ico|favicon-.*|android-chrome-.*|apple-touch-icon.*|logo\\..*|robots\\.txt).*)',
  ],
}
