// app/layout.tsx — Root layout
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PRODUCT_NAME } from '@/lib/brand'

export const metadata: Metadata = {
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
