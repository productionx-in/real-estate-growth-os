// app/layout.tsx — Root layout
import { AuthLinkCatcher } from '@/components/auth/AuthLinkCatcher'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { siteUrl } from '@/lib/site/urls'
import { THEME_BOOT_SCRIPT } from '@/lib/theme/runtime'
import { ThemeController } from '@/components/theme/ThemeController'
import { DeploymentRibbon } from '@/components/layout/DemoBanner'
import { Analytics } from '@vercel/analytics/next'

const SITE = siteUrl()

export const metadata: Metadata = {
  // Absolute canonical and Open Graph URLs come from configuration (lib/site/urls.ts), never a literal domain.
  ...(SITE ? { metadataBase: new URL(SITE) } : {}),
  openGraph: {
    siteName: PRODUCT_NAME, type: 'website', locale: 'en_IN',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: PRODUCT_NAME }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
  title: {
    template: `%s | ${PRODUCT_NAME}`,
    default: `${PRODUCT_NAME} — ${PRODUCT_DESCRIPTOR}`,
  },
  description: `${PRODUCT_NAME} connects lead management, sales teams, property inventory, site visits, bookings and channel-partner workflows in one platform by Production X.`,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
}

// Self-hosted at build time by next/font: no request to Google at runtime, no layout shift.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const viewport: Viewport = {
  themeColor: '#0b1120',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Sets day/night before the first paint (lib/theme/runtime.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeController />
        <DeploymentRibbon />
        <AuthLinkCatcher />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
