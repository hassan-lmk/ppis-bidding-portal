export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

export type PasswordRulesStatus = {
  length: boolean
  uppercase: boolean
  lowercase: boolean
  number: boolean
  special: boolean
}

/** At least one character that is not a letter, digit, or whitespace (e.g. !@#$%^&*) */
const SPECIAL_RE = /[^A-Za-z0-9\s]/

export function getPasswordRulesStatus(password: string): PasswordRulesStatus {
  const len = password.length
  return {
    length: len >= PASSWORD_MIN_LENGTH && len <= PASSWORD_MAX_LENGTH,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: SPECIAL_RE.test(password),
  }
}

export function passwordMeetsPolicy(password: string): boolean {
  const s = getPasswordRulesStatus(password)
  return s.length && s.uppercase && s.lowercase && s.number && s.special
}

export function passwordPolicyErrorMessage(): string {
  return `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters and include an uppercase letter, a lowercase letter, a number, and a special character (!@#$%^&* etc.).`
}
