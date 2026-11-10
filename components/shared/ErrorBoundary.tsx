'use client'
// components/shared/ErrorBoundary.tsx
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-10 h-10 rounded-lg bg-[var(--danger-bg)] flex items-center justify-center mb-3">
            <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
          </div>
          <p className="text-[14px] font-medium text-[var(--foreground)]">Something went wrong</p>
          <p className="mt-1 text-[13px] text-[var(--foreground-muted)]">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-3 py-1.5 text-[13px] font-medium text-[var(--brand)] border border-[var(--brand)] rounded-md hover:bg-[var(--brand-light)] transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
