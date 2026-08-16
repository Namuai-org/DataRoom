'use client'

import { useFormStatus } from 'react-dom'
import type { ReactNode } from 'react'
import { buttonClass, type ButtonVariant } from './ui'

/**
 * A submit button that knows when its own form is in flight. `useFormStatus`
 * only reports the nearest enclosing <form>, so this must be a child of the
 * form it submits — never a sibling.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  name,
  value,
  formAction,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  pendingLabel?: string
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
  name?: string
  value?: string
  formAction?: (formData: FormData) => void | Promise<void>
  'aria-label'?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      name={name}
      value={value}
      formAction={formAction}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      className={buttonClass(variant, size, className)}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}

/**
 * A submit button that asks first. Used for anything that destroys data.
 *
 * `window.confirm` is deliberate: it is the one dialog that cannot be missed,
 * cannot be styled into invisibility, and is already keyboard-accessible. A
 * prettier custom modal here would be worse, not better.
 */
export function ConfirmSubmit({
  children,
  confirmMessage,
  variant = 'danger',
  size = 'sm',
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  confirmMessage: string
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  className?: string
  disabled?: boolean
  'aria-label'?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault()
      }}
      className={buttonClass(variant, size, className)}
    >
      {children}
    </button>
  )
}

/** Icon-only variant. `label` is required — it becomes the accessible name. */
export function IconSubmit({
  children,
  label,
  variant = 'ghost',
  className,
  disabled,
  name,
  value,
}: {
  children: ReactNode
  label: string
  variant?: ButtonVariant
  className?: string
  disabled?: boolean
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={label}
      title={label}
      className={buttonClass(variant, 'sm', `h-8 w-8 !px-0 ${className ?? ''}`)}
    >
      {children}
    </button>
  )
}
