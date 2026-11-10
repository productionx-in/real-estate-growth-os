// middleware.ts - Updated for stable Next.js 15 Edge Runtime
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export const runtime = 'nodejs'

const PUBLIC_ROUTES = ['/', '/login', '/register', '/auth/callback', '/auth/confirm']
const AUTH_ROUTES = ['/login', '/register']

export async function middleware(request: NextRequest) {
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

  const { pathname } = request.nextUrl

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith('/auth/'))) {
    if (user && AUTH_ROUTES.includes(pathname)) {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}