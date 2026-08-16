/**
 * Shared shapes for `useActionState`. These live outside the `'use server'`
 * modules on purpose: a file marked `'use server'` may only export async
 * functions, so constants and types have to be declared somewhere else.
 */

export type ActionStatus = 'idle' | 'success' | 'error'

export type ActionState = {
  status: ActionStatus
  message: string
}

export const IDLE: ActionState = { status: 'idle', message: '' }

export function ok(message: string): ActionState {
  return { status: 'success', message }
}

export function fail(message: string): ActionState {
  return { status: 'error', message }
}

/** Login step one: request a code. */
export type RequestCodeState = ActionState & {
  email: string
  sent: boolean
  /** True when RESEND_API_KEY and EMAIL_FROM are both present. */
  mailConfigured: boolean
}

export const REQUEST_CODE_IDLE: RequestCodeState = {
  status: 'idle',
  message: '',
  email: '',
  sent: false,
  mailConfigured: false,
}

/** Login step two: verify a code. */
export type VerifyCodeState = ActionState & { attemptsLeft: number | null }

export const VERIFY_CODE_IDLE: VerifyCodeState = {
  status: 'idle',
  message: '',
  attemptsLeft: null,
}

/**
 * Creating or regenerating an invite hands back the one and only copy of the
 * raw link. Nothing else in the console ever holds a raw token.
 */
export type InviteState = ActionState & {
  url: string | null
  visitorLabel: string | null
  emailed: boolean
  mailConfigured: boolean
}

export const INVITE_IDLE: InviteState = {
  status: 'idle',
  message: '',
  url: null,
  visitorLabel: null,
  emailed: false,
  mailConfigured: false,
}

/** Turns a thrown action error into a state a form can render. */
export function fromError(error: unknown, fallback: string): ActionState {
  const message = error instanceof Error ? error.message : fallback
  return fail(message || fallback)
}
