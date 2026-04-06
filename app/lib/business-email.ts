/**
 * Personal / disposable domains not allowed for bidder signup.
 * Business registration should use a corporate domain.
 */
const BLOCKED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'ymail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'outlook.co.uk',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'mail.com',
  'email.com',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'yandex.com',
  'yandex.ru',
  'tutanota.com',
  'tutamail.com',
  'hey.com',
  'fastmail.com',
  'fastmail.fm',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'sk.com', // often sk.co.kr personal? Skip ambiguous
  'mail.ru',
  'inbox.ru',
  'bk.ru',
  'list.ru',
  'rocketmail.com',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'dispostable.com',
  '10minutemail.com',
])

function domainIsBlocked(domain: string): boolean {
  const d = domain.trim().toLowerCase()
  if (!d || !d.includes('.')) return true
  if (BLOCKED_EMAIL_DOMAINS.has(d)) return true
  for (const blocked of BLOCKED_EMAIL_DOMAINS) {
    if (d.endsWith(`.${blocked}`)) return true
  }
  return false
}

/**
 * Returns true if the email looks like a corporate/work address (not a common free provider).
 */
export function isBusinessEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  if (at <= 0 || at === normalized.length - 1) return false
  const local = normalized.slice(0, at)
  if (!local) return false
  const domain = normalized.slice(at + 1)
  if (domainIsBlocked(domain)) return false
  return true
}

export function businessEmailErrorMessage(): string {
  return 'Please use your company email address. Personal addresses (Gmail, Yahoo, Outlook, etc.) are not accepted.'
}
