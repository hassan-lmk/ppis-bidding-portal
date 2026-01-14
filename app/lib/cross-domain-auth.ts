/**
 * Cross-Domain Authentication Helper
 * 
 * This module handles setting/getting auth cookies on the parent domain
 * to enable seamless SSO between ppisonline.com and ebid.ppisonline.com
 */

const COOKIE_NAME = 'ppis_auth_token'
const COOKIE_DOMAIN = '.ppisonline.com' // Parent domain for both sites

interface AuthTokens {
  access_token: string
  refresh_token: string
  expires_at?: number
}

/**
 * Set auth tokens in a cookie on the parent domain
 * This allows subdomains to share the session
 */
export function setAuthCookie(tokens: AuthTokens): void {
  if (typeof document === 'undefined') return
  
  try {
    const tokenData = JSON.stringify(tokens)
    const encoded = btoa(tokenData) // Base64 encode for safety
    
    // Calculate expiry - default 7 days if not provided
    const expiryMs = tokens.expires_at 
      ? tokens.expires_at * 1000 
      : Date.now() + 7 * 24 * 60 * 60 * 1000
    const expires = new Date(expiryMs).toUTCString()
    
    // Set cookie on parent domain for cross-subdomain access
    // In development (localhost), don't set domain
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const domainPart = isLocalhost ? '' : `; Domain=${COOKIE_DOMAIN}`
    
    document.cookie = `${COOKIE_NAME}=${encoded}; Path=/; Expires=${expires}${domainPart}; SameSite=Lax; Secure`
    
    console.log('✅ Cross-domain auth cookie set')
  } catch (error) {
    console.error('Error setting auth cookie:', error)
  }
}

/**
 * Get auth tokens from the cross-domain cookie
 */
export function getAuthCookie(): AuthTokens | null {
  if (typeof document === 'undefined') return null
  
  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=')
      if (name === COOKIE_NAME && value) {
        const decoded = atob(value)
        return JSON.parse(decoded) as AuthTokens
      }
    }
  } catch (error) {
    console.error('Error reading auth cookie:', error)
  }
  
  return null
}

/**
 * Clear the cross-domain auth cookie
 */
export function clearAuthCookie(): void {
  if (typeof document === 'undefined') return
  
  try {
    // Clear on parent domain
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const domainPart = isLocalhost ? '' : `; Domain=${COOKIE_DOMAIN}`
    
    document.cookie = `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT${domainPart}; SameSite=Lax; Secure`
    
    console.log('✅ Cross-domain auth cookie cleared')
  } catch (error) {
    console.error('Error clearing auth cookie:', error)
  }
}

/**
 * Check if there's a valid auth cookie
 */
export function hasAuthCookie(): boolean {
  return getAuthCookie() !== null
}
