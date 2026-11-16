// app/layout.tsx — Root layout
import type { Metadata } from 'next'
import './globals.css'
import { PRODUCT_NAME } from '@/lib/brand'

export const metadata: Metadata = {
  title: {
    template: `%s | ${PRODUCT_NAME}`,
    default: PRODUCT_NAME,
  },
  description: 'Lead management for real-estate developers and channel partners: capture every enquiry, assign it in seconds, follow up.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
