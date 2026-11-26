/**
 * Next.js Proxy (formerly Middleware) — refreshes the Supabase Auth session on
 * every request so the cookie-based session token stays current and server-
 * rendered pages always see the correct auth state.
 *
 * Next.js 16 renamed the "middleware" file convention to "proxy" and requires
 * the exported function to be named `proxy` (or be a default export).
 *
 * Uses @supabase/ssr createServerClient with cookie read/write helpers as
 * recommended by Supabase for Next.js App Router.
 *
 * This file must live at the project root (beside package.json).
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Only attempt session refresh when Supabase is configured.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    // Supabase not configured — pass through without touching auth
    return NextResponse.next()
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // Calling getUser() triggers a token refresh if needed.
  // We intentionally ignore the result — this proxy only refreshes the
  // session cookie; routing decisions are handled in components.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (static files)
     * - _next/image   (image optimisation)
     * - favicon.ico   (browser default)
     * - public folder files (images, icons, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
