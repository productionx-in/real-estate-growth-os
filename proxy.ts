import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

const PUBLIC_ROUTES = ['/', '/pricing', '/demo', '/leakage-audit', '/privacy', '/terms', '/login', '/auth/callback', '/auth/confirm']
// Loaded by visitors of customers' websites, who are never signed in to REGrow.
const PUBLIC_WEBSITE_ASSETS = ['/capture.js', '/forms/embed.js', '/forms/view']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Closed-SaaS Decommissioning: Redirect /register to login with closed_saas notice
  if (pathname === '/register' || pathname.startsWith('/register/')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('notice', 'closed_saas')
    return NextResponse.redirect(loginUrl)
  }

  // 2. Allow invitation activation page to load publicly without premature login bounce
  const isInviteRoute = pathname.startsWith('/invite/')

  // 3. API routes are never redirected to the login page. Every /api route authenticates its caller
  //    itself (session + membership, API key, webhook signature/secret, or job-worker bearer) and
  //    answers 401/403 as JSON. Redirecting here broke every machine caller — Meta/Google/portal/
  //    WhatsApp lead webhooks, public form submissions and the job worker — with a 307 to /login.
  const isApiRoute = pathname === '/api' || pathname.startsWith('/api/')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fallback protection: If env vars are somehow missing, let public routes load without crashing
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables in runtime.')
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user ?? null
  } catch (error) {
    console.error('Failed to get user session:', error)
  }

  // Allow public routes and invite verification
  if (
    isApiRoute ||
    isInviteRoute ||
    PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith('/auth/')) ||
    PUBLIC_WEBSITE_ASSETS.includes(pathname) ||
    /^\/d\/[A-Za-z0-9_-]{43}$/.test(pathname) || // documents shared with buyers (the link is the key)
    /^\/p\/[a-z0-9-]{1,80}$/.test(pathname) // a project's public showroom: the page itself shows only published microsites
  ) {
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/select-org'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Protect all other routes
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
