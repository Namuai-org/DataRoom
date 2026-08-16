'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { buttonClass, type ButtonVariant } from './ui'

/**
 * Copies a string and says so. Falls back to a hidden textarea and
 * `document.execCommand` because `navigator.clipboard` is unavailable on
 * insecure origins — which includes a plain-HTTP preview of this console.
 */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  variant = 'secondary',
  size = 'sm',
  className,
}: {
  value: string
  label?: string
  copiedLabel?: string
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  async function copy() {
    let done = false
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
        done = true
      }
    } catch {
      done = false
    }

    if (!done) {
      const scratch = document.createElement('textarea')
      scratch.value = value
      scratch.setAttribute('readonly', '')
      scratch.style.position = 'fixed'
      scratch.style.opacity = '0'
      document.body.appendChild(scratch)
      scratch.select()
      try {
        done = document.execCommand('copy')
      } catch {
        done = false
      }
      document.body.removeChild(scratch)
    }

    if (done) {
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2200)
    }
  }

  return (
    <button type="button" onClick={copy} className={buttonClass(variant, size, className)}>
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  )
}

/** A read-only field with its own copy control, for one-time secrets. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        readOnly
        value={value}
        aria-label={label ?? 'Link'}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full min-w-0 flex-1 rounded-[9px] border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5 font-mono text-[0.78rem] text-[var(--text-primary)]"
      />
      <CopyButton value={value} label="Copy link" copiedLabel="Copied" className="shrink-0" />
    </div>
  )
}
