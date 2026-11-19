// app/layout.tsx — Root layout
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PRODUCT_NAME } from '@/lib/brand'
import { siteUrl } from '@/lib/site/urls'
import { THEME_BOOT_SCRIPT } from '@/lib/theme/runtime'
import { ThemeController } from '@/components/theme/ThemeController'

const SITE = siteUrl()

export const metadata: Metadata = {
  // Absolute canonical and Open Graph URLs come from configuration (lib/site/urls.ts), never a literal domain.
  ...(SITE ? { metadataBase: new URL(SITE) } : {}),
  openGraph: { siteName: PRODUCT_NAME, type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary' },
  title: {
    template: `%s | ${PRODUCT_NAME}`,
    default: PRODUCT_NAME,
  },
  description: 'Lead management for real-estate developers and channel partners: capture every enquiry, assign it in seconds, follow up.',
}

// Self-hosted at build time by next/font: no request to Google at runtime, no layout shift.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
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
        {children}
      </body>
    </html>
  )
}
