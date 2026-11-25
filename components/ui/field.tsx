// components/ui/field.tsx — form controls. Every control gets a visible label, and errors are announced.
import * as React from 'react'
import { cn } from '@/lib/utils/cn'

// 16px text on phones: smaller text makes iOS zoom the page when a field is focused. Compact on larger screens.
// Design language v3: fields sit into the surface (.field, app/globals.css) and come forward with a soft glow on focus.
const control =
  'field w-full rounded-md border border-default px-3 text-[16px] sm:text-[13px] text-foreground ' +
  'placeholder:text-subtle focus-visible:outline-none focus-visible:border-ring ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-subtle ' +
  'aria-[invalid=true]:border-danger'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(control, 'h-10 sm:h-9', className)} {...props} />
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...props} />
)
Textarea.displayName = 'Textarea'

/** Native select: keyboard, screen-reader and mobile behaviour come for free. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(control, 'h-10 sm:h-9 pr-8', className)} {...props} />
)
Select.displayName = 'Select'

export function Label({ className, required, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-[12px] font-medium text-foreground', className)} {...props}>
      {children}
      {required && <span aria-hidden className="ml-0.5 text-danger">*</span>}
    </label>
  )
}

interface FieldProps {
  label: string
  /** Rendered control. Receives id, aria-describedby and aria-invalid automatically. */
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }>
  hint?: string
  error?: string
  required?: boolean
  className?: string
}

/** Label + control + hint/error, wired together for assistive technology. */
export function Field({ label, children, hint, error, required, className }: FieldProps) {
  const autoId = React.useId()
  const id = children.props.id ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} required={required}>{label}</Label>
      {React.cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {hint && !error && <p id={hintId} className="text-[12px] text-subtle">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
