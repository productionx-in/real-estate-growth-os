// app/layout.tsx — Root layout
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | Real Estate Growth OS',
    default: 'Real Estate Growth OS',
  },
  description: 'Integrated real estate marketing, CRM and sales management platform',
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
