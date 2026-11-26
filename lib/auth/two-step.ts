// lib/auth/two-step.ts — two-step verification (TOTP) for workspace users. Pure decision + small readers.
// - Someone who turned it on must enter a code each session: an AAL1 session with a verified factor is refused
//   everywhere (authenticateCaller) until the code is entered (the workspace layout shows the code screen).
// - A workspace can require it for everyone (org_settings.security.requireTwoStep, 20260106): members without it are
//   sent to set it up before anything in that workspace opens or answers.
// The RE console has always required it for staff (lib/auth/platform.ts); this is the customer side.

export type TwoStepNeed = 'verify' | 'enrol' | null

export interface TwoStepState {
  /** The session's level: aal2 once a code was entered this session. */
  current: 'aal1' | 'aal2' | null
  /** Whether the account has a verified authenticator (Supabase reports the next level as aal2). */
  hasFactor: boolean
}

/** What must happen before the person may continue. */
export function twoStepNeed(state: TwoStepState, workspaceRequires: boolean): TwoStepNeed {
  if (state.current === 'aal2') return null
  if (state.hasFactor) return 'verify'
  return workspaceRequires ? 'enrol' : null
}

type AalReader = { auth: { mfa: { getAuthenticatorAssuranceLevel: () => Promise<{ data: { currentLevel: string | null; nextLevel: string | null } | null }> } } }

export async function readTwoStep(supabase: AalReader): Promise<TwoStepState> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const current = data?.currentLevel === 'aal2' ? 'aal2' : data?.currentLevel === 'aal1' ? 'aal1' : null
  return { current, hasFactor: data?.nextLevel === 'aal2' }
}

export const TWO_STEP_MESSAGES = {
  verify: 'Enter the code from your authenticator app to continue.',
  enrol: 'This workspace requires two-step verification. Set it up to continue.',
} as const
