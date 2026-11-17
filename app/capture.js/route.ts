// app/capture.js/route.ts — the website capture script (see lib/integrations/website/capture-script.ts).
// Public and identical for every customer: the website key is read from the script tag, never from here.
import { NextResponse } from 'next/server'
import { CAPTURE_SCRIPT } from '@/lib/integrations/website/capture-script'

export const dynamic = 'force-static'

export function GET() {
  return new NextResponse(CAPTURE_SCRIPT, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
