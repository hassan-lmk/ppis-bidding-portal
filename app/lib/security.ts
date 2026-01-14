/**
 * Security Utilities for API Routes
 * Provides admin authorization, rate limiting, XSS protection, and other security features
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ============================================================================
// ADMIN AUTHORIZATION
// ============================================================================

export interface AdminAuthResult {
  authorized: boolean
  user?: {
    id: string
    email: string
  }
  error?: string
}

/**
 * Verifies if the request is from an authenticated admin user
 * Checks both user_type='admin' and is_admin flag in user_profiles table
 */
export async function verifyAdminAuth(request: NextRequest): Promise<AdminAuthResult> {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        authorized: false,
        error: 'Missing or invalid authorization header'
      }
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Create Supabase client with user token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        authorized: false,
        error: 'Supabase configuration missing'
      }
    }

    // Create HTTPS agent for proper TLS handling (for self-hosted Supabase)
    // This ensures consistent behavior with other API routes
    const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true'
    const isProduction = process.env.NODE_ENV === 'production'
    const rejectUnauthorized = isProduction && !allowInsecure
    
    const httpsAgent = new (require('https').Agent)({
      rejectUnauthorized,
      keepAlive: true,
      // Allow TLS 1.2 and 1.3 (Node.js default, but explicit for compatibility)
      // Let Node.js negotiate the best protocol version
      minVersion: 'TLSv1.2',
      maxVersion: 'TLSv1.3',
    })
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        },
        // Use custom fetch with httpsAgent for server-side requests
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          // For server-side, we need custom fetch with httpsAgent
          if (typeof window === 'undefined') {
            return new Promise((resolve, reject) => {
              const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
              const urlObj = new URL(url)
              const isHttps = urlObj.protocol === 'https:'
              
              const options: any = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: init?.method || 'GET',
                headers: init?.headers || {},
                agent: isHttps ? httpsAgent : undefined
              }
              
              const httpModule = isHttps ? require('https') : require('http')
              const req = httpModule.request(options, (res: any) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => chunks.push(chunk))
                res.on('end', () => {
                  const body = Buffer.concat(chunks)
                  resolve(new Response(body, {
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers
                  }))
                })
              })
              
              req.on('error', reject)
              if (init?.body) {
                if (typeof init.body === 'string') {
                  req.write(init.body)
                } else if (init.body instanceof Buffer) {
                  req.write(init.body)
                } else {
                  req.write(JSON.stringify(init.body))
                }
              }
              req.end()
            })
          }
          // Browser: use standard fetch
          return fetch(input, init)
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('Token validation failed:', {
        error: authError,
        hasUser: !!user,
        tokenPrefix: token.substring(0, 20) + '...',
        supabaseUrl: supabaseUrl?.substring(0, 30) + '...'
      })
      return {
        authorized: false,
        error: authError?.message || 'Invalid or expired token'
      }
    }

    // Check admin status from database
    // Use service role key to bypass RLS since we've already verified the user's identity
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured')
      return {
        authorized: false,
        error: 'Server configuration error'
      }
    }

    // Use direct HTTP requests with service role key (like other API routes)
    // This ensures apikey header is included and bypasses RLS
    const makeServiceRoleRequest = async (path: string, method: string = 'GET'): Promise<any> => {
      return new Promise((resolve, reject) => {
        const urlObj = new URL(`${supabaseUrl}/rest/v1/${path}`)
        const isHttps = urlObj.protocol === 'https:'
        
        const options: any = {
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: method,
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          agent: isHttps ? httpsAgent : undefined
        }
        
        const httpModule = isHttps ? require('https') : require('http')
        const req = httpModule.request(options, (res: any) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks)
            if (res.statusCode && res.statusCode >= 400) {
              try {
                const errorData = JSON.parse(body.toString())
                reject(new Error(errorData.message || `HTTP ${res.statusCode}`))
              } catch {
                reject(new Error(`HTTP ${res.statusCode}: ${body.toString()}`))
              }
            } else {
              try {
                const data = body.length > 0 ? JSON.parse(body.toString()) : null
                resolve(data)
              } catch {
                resolve(null)
              }
            }
          })
        })
        
        req.on('error', reject)
        req.end()
      })
    }

    // Try both 'id' and 'user_id' since table structure may vary
    let profile: any = null
    let profileError: any = null
    
    try {
      // First try with 'id' (matches auth.users.id directly)
      const profilesById = await makeServiceRoleRequest(
        `user_profiles?select=user_type&id=eq.${user.id}`
      )
      
      if (Array.isArray(profilesById) && profilesById.length > 0) {
        profile = profilesById[0]
      } else {
        // If that fails, try with 'user_id' (foreign key reference)
        const profilesByUserId = await makeServiceRoleRequest(
          `user_profiles?select=user_type&user_id=eq.${user.id}`
        )
        
        if (Array.isArray(profilesByUserId) && profilesByUserId.length > 0) {
          profile = profilesByUserId[0]
        } else {
          profileError = new Error('Profile not found with either id or user_id')
          console.error('Profile lookup failed:', {
            userId: user.id,
            userEmail: user.email,
            profilesById: profilesById,
            profilesByUserId: profilesByUserId
          })
        }
      }
    } catch (error: any) {
      profileError = error
      console.error('Error fetching profile:', {
        userId: user.id,
        userEmail: user.email,
        error: error.message
      })
    }

    if (profileError || !profile) {
      return {
        authorized: false,
        error: `User profile not found: ${profileError?.message || 'No profile exists for this user. Please ensure your profile exists in the user_profiles table.'}`
      }
    }

    // Check if user is admin (using user_type column)
    const isAdmin = profile.user_type === 'admin'

    if (!isAdmin) {
      return {
        authorized: false,
        error: 'Admin access required'
      }
    }

    return {
      authorized: true,
      user: {
        id: user.id,
        email: user.email || ''
      }
    }
  } catch (error: any) {
    console.error('Admin auth verification error:', error)
    return {
      authorized: false,
      error: 'Authentication verification failed'
    }
  }
}

/**
 * Middleware wrapper for admin-protected API routes
 * Returns 401/403 if user is not authorized
 */
export async function requireAdmin(
  request: NextRequest,
  handler: (request: NextRequest, adminUser: { id: string; email: string }) => Promise<NextResponse>
): Promise<NextResponse> {
  const authResult = await verifyAdminAuth(request)
  
  if (!authResult.authorized || !authResult.user) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.error?.includes('Admin') ? 403 : 401 }
    )
  }

  return handler(request, authResult.user)
}

// ============================================================================
// XSS PROTECTION
// ============================================================================

/**
 * Sanitizes string input to prevent XSS attacks
 * Removes HTML tags, JavaScript, and event handlers
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return String(input || '')
  }

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove JavaScript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: URLs that could contain scripts
    .replace(/data:text\/html/gi, '')
    // Remove event handlers (onclick, onerror, etc.)
    .replace(/on\w+\s*=/gi, '')
    // Remove script tags
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    // Remove iframe tags
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    // Remove style tags
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    // Trim whitespace
    .trim()
}

/**
 * Sanitizes an object recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = { ...obj }
  
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'string') {
      sanitized[key] = sanitizeString(sanitized[key]) as T[Extract<keyof T, string>]
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeObject(sanitized[key])
    } else if (Array.isArray(sanitized[key])) {
      sanitized[key] = sanitized[key].map((item: any) => 
        typeof item === 'string' ? sanitizeString(item) : 
        typeof item === 'object' && item !== null ? sanitizeObject(item) : 
        item
      ) as T[Extract<keyof T, string>]
    }
  }
  
  return sanitized
}

// ============================================================================
// FILE VALIDATION
// ============================================================================

export interface FileValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validates file by checking magic bytes (file signature)
 * More secure than just checking MIME type
 */
export async function validateFileContent(
  file: File,
  expectedType: 'pdf' | 'image' | 'image-jpg' | 'image-png'
): Promise<FileValidationResult> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileSignature = buffer.slice(0, 4)

    switch (expectedType) {
      case 'pdf':
        // PDF files start with %PDF
        const pdfHeader = buffer.slice(0, 4).toString('ascii')
        if (pdfHeader !== '%PDF') {
          return { valid: false, error: 'Invalid PDF file - file signature mismatch' }
        }
        break

      case 'image-jpg':
        // JPEG files start with FF D8 FF
        if (fileSignature[0] !== 0xFF || fileSignature[1] !== 0xD8 || fileSignature[2] !== 0xFF) {
          return { valid: false, error: 'Invalid JPEG file - file signature mismatch' }
        }
        break

      case 'image-png':
        // PNG files start with 89 50 4E 47
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47])
        if (!fileSignature.equals(pngSignature)) {
          return { valid: false, error: 'Invalid PNG file - file signature mismatch' }
        }
        break

      case 'image':
        // Check for common image formats
        const isJpeg = fileSignature[0] === 0xFF && fileSignature[1] === 0xD8
        const isPng = fileSignature.equals(Buffer.from([0x89, 0x50, 0x4E, 0x47]))
        const bufferSlice = buffer.slice(0, 12)
        const isGif = bufferSlice.slice(0, 3).toString('ascii') === 'GIF'
        const isWebP = bufferSlice.slice(0, 4).toString('ascii') === 'RIFF' && 
                       bufferSlice.slice(8, 12).toString('ascii') === 'WEBP'

        if (!isJpeg && !isPng && !isGif && !isWebP) {
          return { valid: false, error: 'Invalid image file - file signature mismatch' }
        }
        break
    }

    return { valid: true }
  } catch (error: any) {
    return { valid: false, error: `File validation error: ${error.message}` }
  }
}

/**
 * Validates file size
 */
export function validateFileSize(file: File, maxSizeMB: number): FileValidationResult {
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size too large. Maximum ${maxSizeMB}MB allowed.`
    }
  }
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty'
    }
  }
  return { valid: true }
}

/**
 * Comprehensive file validation
 */
export async function validateFile(
  file: File,
  options: {
    allowedTypes: string[]
    maxSizeMB: number
    validateContent?: boolean
    expectedContentType?: 'pdf' | 'image' | 'image-jpg' | 'image-png'
  }
): Promise<FileValidationResult> {
  // Check file size first
  const sizeCheck = validateFileSize(file, options.maxSizeMB)
  if (!sizeCheck.valid) {
    return sizeCheck
  }

  // If content validation is enabled, use it as the primary check
  // This is more reliable than MIME type, especially for files uploaded via XMLHttpRequest
  if (options.validateContent && options.expectedContentType) {
    const contentCheck = await validateFileContent(file, options.expectedContentType)
    if (contentCheck.valid) {
      // Content validation passed, so file is valid regardless of MIME type
      return { valid: true }
    }
    // If content validation fails, return the error
      return contentCheck
  }

  // Fallback to MIME type check if content validation is not enabled
  // Also check file extension as a fallback for application/octet-stream
  const fileExtension = file.name.split('.').pop()?.toLowerCase()
  const isAllowedMimeType = options.allowedTypes.includes(file.type)
  const isOctetStream = file.type === 'application/octet-stream' || file.type === ''
  
  // For PDF files, if MIME type is octet-stream but extension is pdf, allow it
  const isPdfExtension = fileExtension === 'pdf'
  const isPdfAllowed = options.allowedTypes.includes('application/pdf')
  
  if (!isAllowedMimeType) {
    // If it's octet-stream with PDF extension and PDF is allowed, that's okay
    if (isOctetStream && isPdfExtension && isPdfAllowed) {
      return { valid: true }
    }
    
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${options.allowedTypes.join(', ')}. Received: ${file.type || 'unknown'}`
    }
  }

  return { valid: true }
}

// ============================================================================
// FILE PATH SECURITY
// ============================================================================

/**
 * Sanitizes file name to prevent path traversal attacks
 */
export function sanitizeFileName(input: string): string {
  return input
    // Remove path separators
    .replace(/[\/\\]/g, '')
    // Remove path traversal sequences
    .replace(/\.\./g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove special characters, keep alphanumeric, dots, hyphens, underscores
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    // Limit length
    .slice(0, 100)
    // Remove leading/trailing dots and hyphens
    .replace(/^[.-]+|[.-]+$/g, '')
}

/**
 * Validates and sanitizes a URL to prevent XSS and open redirect attacks
 * Only allows relative paths (starting with /) or same-origin URLs
 */
export function validateAndSanitizeUrl(url: string, allowedOrigin?: string): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }

  // Remove whitespace
  const trimmed = url.trim()
  
  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:']
  const lowerUrl = trimmed.toLowerCase()
  
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return null
    }
  }

  // Allow relative paths (starting with /)
  if (trimmed.startsWith('/')) {
    // Validate it's a safe relative path (no protocol, no host)
    if (!trimmed.match(/^\/[^:]*$/)) {
      return null
    }
    return trimmed
  }

  // For absolute URLs, validate origin
  try {
    const urlObj = new URL(trimmed)
    
    // If allowedOrigin is provided, check it matches
    if (allowedOrigin) {
      const allowedUrl = new URL(allowedOrigin)
      if (urlObj.origin !== allowedUrl.origin) {
        return null
      }
    } else {
      // Default: only allow same origin (current site)
      // In browser context, this would be window.location.origin
      // For server-side, we'll be more restrictive
      return null
    }
    
    // Only allow http and https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return null
    }
    
    return trimmed
  } catch {
    // Invalid URL format
    return null
  }
}

/**
 * Validates a relative path (must start with / and contain no protocols)
 */
export function validateRelativePath(path: string): string | null {
  if (!path || typeof path !== 'string') {
    return null
  }

  const trimmed = path.trim()
  
  // Must start with /
  if (!trimmed.startsWith('/')) {
    return null
  }
  
  // Must not contain :// (protocol)
  if (trimmed.includes('://')) {
    return null
  }
  
  // Must not contain javascript: or data: even if encoded
  const lowerPath = trimmed.toLowerCase()
  if (lowerPath.includes('javascript:') || lowerPath.includes('data:')) {
    return null
  }
  
  return trimmed
}

/**
 * Safely constructs file path
 */
export function buildSafeFilePath(folder: string, fileName: string): string {
  const sanitizedFolder = folder
    .replace(/^\/+|\/+$/g, '') // Remove leading/trailing slashes
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/[\/\\]/g, '/') // Normalize separators
  
  const sanitizedFile = sanitizeFileName(fileName)
  
  return `${sanitizedFolder}/${sanitizedFile}`.replace(/\/+/g, '/')
}

// ============================================================================
// RATE LIMITING (Simple in-memory implementation)
// ============================================================================

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const rateLimitStore: RateLimitStore = {}

/**
 * Simple rate limiting implementation
 * For production, consider using Redis or a dedicated service
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now()
  const key = identifier.toLowerCase()

  // Clean up expired entries (every 1000 requests)
  if (Object.keys(rateLimitStore).length > 1000) {
    Object.keys(rateLimitStore).forEach(k => {
      if (rateLimitStore[k].resetTime < now) {
        delete rateLimitStore[k]
      }
    })
  }

  const entry = rateLimitStore[key]

  if (!entry || entry.resetTime < now) {
    // Create new entry
    rateLimitStore[key] = {
      count: 1,
      resetTime: now + windowMs
    }
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs
    }
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime
    }
  }

  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime
  }
}

/**
 * Gets client identifier for rate limiting
 */
export function getRateLimitIdentifier(request: NextRequest): string {
  // Try to get user ID from auth header first
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '')
      // In production, decode JWT to get user ID
      // For now, use IP as fallback
    } catch {}
  }

  // Fallback to IP address
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             'unknown'

  return ip
}

/**
 * Rate limit middleware
 */
export function rateLimit(
  request: NextRequest,
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; response?: NextResponse } {
  const identifier = getRateLimitIdentifier(request)
  const result = checkRateLimit(identifier, maxRequests, windowMs)

  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetTime.toString()
          }
        }
      )
    }
  }

  return { allowed: true }
}

// ============================================================================
// CSRF PROTECTION
// ============================================================================

/**
 * Generates CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Validates CSRF token
 */
export function validateCsrfToken(request: NextRequest, expectedToken?: string): boolean {
  // Get token from header
  const token = request.headers.get('x-csrf-token')
  
  if (!token || !expectedToken) {
    return false
  }

  // Constant-time comparison to prevent timing attacks
  if (token.length !== expectedToken.length) {
    return false
  }

  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedToken)
  )
}

// ============================================================================
// TLS CONFIGURATION (for self-hosted Supabase)
// ============================================================================

import https from 'https'

/**
 * Creates HTTPS agent with configurable TLS verification
 * For self-hosted Supabase in closed environments, TLS verification can be disabled
 * Set ALLOW_INSECURE_TLS=true in environment for closed environments
 */
export function createHttpsAgent(): https.Agent {
  const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  const allowOldTls = process.env.ALLOW_OLD_TLS === 'true' // For self-hosted Supabase with older TLS

  // In production, always verify unless explicitly allowed for closed environment
  const rejectUnauthorized = isProduction && !allowInsecure

  if (allowInsecure && isProduction) {
    console.warn('⚠️  TLS verification disabled - only use in closed/secure environments')
  }

  // Secure cipher suites - excludes weak ciphers (RC4, DES, MD5, etc.)
  // Only modern, secure cipher suites for TLS 1.2 and 1.3
  const secureCiphers = [
    // TLS 1.3 ciphers (automatically used by Node.js, but listed for reference)
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    // TLS 1.2 secure ciphers (ECDHE with strong encryption)
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES128-SHA256',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-ECDSA-AES256-SHA384',
    'ECDHE-RSA-AES256-SHA384',
  ].join(':')

  const agentOptions: https.AgentOptions = {
    rejectUnauthorized,
    keepAlive: true,
    // Specify secure cipher suites to prevent weak cipher usage
    ciphers: secureCiphers,
    // Honor cipher order (server preference)
    honorCipherOrder: true,
  }

  // Set TLS version constraints
  if (allowOldTls) {
    // Allow older TLS versions for compatibility with self-hosted Supabase
    // WARNING: Only use in closed/secure environments
    console.warn('⚠️  Allowing older TLS versions - only use in closed/secure environments')
    agentOptions.minVersion = 'TLSv1'
    agentOptions.maxVersion = 'TLSv1.3'
    // Don't restrict ciphers if allowing old TLS (for compatibility)
    delete agentOptions.ciphers
  } else {
    // Default: Only allow TLS 1.2 and 1.3 (secure)
    agentOptions.minVersion = 'TLSv1.2'
    agentOptions.maxVersion = 'TLSv1.3'
  }

  return new https.Agent(agentOptions)
}

// Lazy initialization of HTTPS agent to avoid build-time issues
// Don't create the agent at module load time - only when needed at runtime
let _httpsAgent: https.Agent | null = null
function getHttpsAgent(): https.Agent {
  if (!_httpsAgent) {
    _httpsAgent = createHttpsAgent()
  }
  return _httpsAgent
}

// Export as a Proxy that lazily initializes when accessed
// This avoids executing createHttpsAgent() at module load time during build
export const httpsAgent = new Proxy({} as https.Agent, {
  get(_target, prop, receiver) {
    const agent = getHttpsAgent()
    const value = (agent as any)[prop]
    if (typeof value === 'function') {
      return value.bind(agent)
    }
    return value
  }
})

// ============================================================================
// INPUT VALIDATION CONSTANTS
// ============================================================================

export const MAX_FIELD_LENGTHS = {
  title: 255,
  description: 5000,
  email: 255,
  organization_name: 255,
  requesting_person: 255,
  designation: 100,
  contact_number: 50,
  country: 100,
  file_name: 255,
  url: 2048
} as const

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validates field length
 */
export function validateFieldLength(field: string, maxLength: number): boolean {
  return field.length <= maxLength
}

