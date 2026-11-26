import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { isIndexablePath, LEGAL_PATHS, MARKETING_PATHS } from '@/lib/site/urls'
import { frameAncestors } from '@/lib/plots/embed'

// /reset-password is public so a person whose reset link expired sees why (and can ask for a new one) instead of
// being bounced to sign-in; the form itself needs the short recovery session to change anything.
const PUBLIC_ROUTES = [...MARKETING_PATHS, ...LEGAL_PATHS, '/login', '/auth/callback', '/auth/confirm', '/reset-password']
// Loaded by visitors of customers' websites, who are never signed in to RE by PX.
const PUBLIC_WEBSITE_ASSETS = ['/capture.js', '/forms/embed.js', '/forms/view', '/robots.txt', '/sitemap.xml', '/llms.txt']

/** Only marketing pages and published project showrooms may be indexed; everything else says so explicitly. */
function markIndexing(res: NextResponse, pathname: string): NextResponse {
  if (!isIndexablePath(pathname) && !['/robots.txt', '/sitemap.xml', '/llms.txt'].includes(pathname)) res.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return res
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Closed-SaaS Decommissioning: Redirect /register to login with closed_saas notice
  if (pathname === '/register' || pathname.startsWith('/register/')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('notice', 'closed_saas')
    return NextResponse.redirect(loginUrl)
  }

  // 1b. An e-mailed auth link that Supabase sent back to the Site URL (the homepage, or any other page) because the
  //     intended address wasn't on its Redirect URLs allowlist: finish it at /auth/callback instead of dropping it.
  //     /auth/callback recognises a password reset from the session itself (lib/auth/recovery.ts).
  if (!pathname.startsWith('/auth/') && !pathname.startsWith('/api/')) {
    const sp = request.nextUrl.searchParams
    if (sp.get('code') && /^[A-Za-z0-9_-]{8,}$/.test(sp.get('code') ?? '')) {
      const to = request.nextUrl.clone()
      to.pathname = '/auth/callback'
      to.search = ''
      to.searchParams.set('code', sp.get('code')!)
      to.searchParams.set('next', '/select-org')
      return NextResponse.redirect(to)
    }
    if (sp.get('error_code') && (sp.get('error') || sp.get('error_description'))) {
      const to = request.nextUrl.clone()
      to.pathname = '/auth/callback'
      return NextResponse.redirect(to)
    }
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
    /^\/m\/[A-Za-z0-9_-]{43}$/.test(pathname) || // plot maps shared with buyers (the link is the key)
    /^\/u\/[0-9a-f-]{36}$/.test(pathname) || // marketing e-mail unsubscribe (the link is the key; nothing private is shown)
    /^\/u\/[0-9a-f-]{36}$/.test(pathname) || // marketing e-mail unsubscribe (the link is the key; nothing private is shown)
    /^\/p\/[a-z0-9-]{1,80}$/.test(pathname) // a project's public showroom: the page itself shows only published microsites
  ) {
    if (user && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/select-org'
      return NextResponse.redirect(url)
    }
    // A shared plot map may be framed only by RE by PX and the websites its workspace listed (lib/plots/embed.ts).
    // Unknown, unshared or lapsed maps get 'self' only. If the lookup fails, the strict default applies.
    const mapToken = pathname.match(/^\/m\/([A-Za-z0-9_-]{43})$/)?.[1]
    if (mapToken) {
      let origins: string[] = []
      try {
        const { data } = await supabase.rpc('plot_map_embed_origins', { p_token: mapToken })
        origins = Array.isArray(data) ? data : []
      } catch { origins = [] }
      supabaseResponse.headers.set('Content-Security-Policy', frameAncestors(origins))
    }
    return markIndexing(supabaseResponse, pathname)
  }

  // Protect all other routes
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return markIndexing(NextResponse.redirect(url), pathname)
  }

  return markIndexing(supabaseResponse, pathname)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
