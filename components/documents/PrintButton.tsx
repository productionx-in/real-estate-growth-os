'use client'
// components/documents/PrintButton.tsx — "Save as PDF" through the browser's print dialog.
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui'

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden /> Save as PDF
    </Button>
  )
}
