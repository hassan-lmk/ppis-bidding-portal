import { createClient } from '@supabase/supabase-js'
import { createHttpsAgent } from '../lib/security'

// Helper function to ensure URL uses HTTPS
function ensureHttps(url: string): string {
  if (!url) return url
  // Remove trailing slash
  url = url.trim().replace(/\/+$/, '')
  // If it doesn't start with http:// or https://, add https://
  if (!url.match(/^https?:\/\//i)) {
    return `https://${url}`
  }
  // Replace http:// with https://
  return url.replace(/^http:\/\//i, 'https://')
}

// Get Supabase URL and ensure HTTPS
const supabaseUrlRaw = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseUrl = supabaseUrlRaw ? ensureHttps(supabaseUrlRaw) : ''

// Custom fetch for self-hosted Supabase with HTTPS agent and retry logic
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500

const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // Only use custom fetch on server-side
  if (typeof window === 'undefined') {
    const makeRequest = (): Promise<Response> => {
      return new Promise((resolve, reject) => {
        const https = require('https')
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url
        const urlObj = new URL(urlStr)
        
        const headers: Record<string, string> = {}
        if (init?.headers) {
          if (init.headers instanceof Headers) {
            init.headers.forEach((v, k) => headers[k] = v)
          } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([k, v]) => headers[k] = String(v))
          } else {
            Object.assign(headers, init.headers)
          }
        }

        const options: any = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: init?.method || 'GET',
          headers: headers,
          agent: createHttpsAgent(), // Use HTTPS agent for self-hosted Supabase
          timeout: 30000 // 30 second timeout
        }

        const req = https.request(options, (res: any) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const body = Buffer.concat(chunks)
            // Handle 204 No Content responses - they should have no body
            const statusCode = res.statusCode || 200
            // Ensure status code is valid (between 200-599)
            const validStatus = statusCode >= 200 && statusCode < 600 ? statusCode : 200
            
            // For 204 No Content, use null body
            const responseBody = validStatus === 204 ? null : body
            
            resolve(new Response(responseBody, {
              status: validStatus,
              statusText: res.statusMessage || 'OK',
              headers: res.headers as HeadersInit
            }))
          })
        })

        // Handle timeout
        req.on('timeout', () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })

        req.on('error', reject)
        
        if (init?.body) {
          if (typeof init.body === 'string') {
            req.write(init.body)
          } else if (init.body instanceof Buffer) {
            req.write(init.body)
          } else if (init.body) {
            req.write(JSON.stringify(init.body))
          }
        }
        
        req.end()
      })
    }

    // Retry logic for connection errors
    let lastError: Error | null = null
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await makeRequest()
      } catch (err: any) {
        lastError = err
        // Only retry on connection errors (ECONNRESET, ETIMEDOUT, etc.)
        const isRetryableError = err.code === 'ECONNRESET' || 
                                  err.code === 'ETIMEDOUT' || 
                                  err.code === 'ECONNREFUSED' ||
                                  err.code === 'EPIPE' ||
                                  err.message === 'Request timeout'
        
        if (!isRetryableError || attempt >= MAX_RETRIES - 1) {
          break
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
        console.log(`[Supabase] Retrying request (attempt ${attempt + 2}/${MAX_RETRIES}) after error: ${err.code || err.message}`)
      }
    }
    
    throw lastError
  }
  
  // Browser: use standard fetch
  return fetch(input, init)
}

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/** Server-only Supabase secret. Never use NEXT_PUBLIC_* for this key. */
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

/**
 * Bypasses RLS. Use only from trusted server routes (e.g. PayFast IPN) where no user session exists.
 * Requires `SUPABASE_SERVICE_ROLE_KEY` in the server environment.
 */
export function createServiceRoleClient() {
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Server webhooks (PayFast IPN, etc.) need this key set only on the server — never as a NEXT_PUBLIC_ variable.'
    )
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: customFetch,
    },
  })
}

// Uses the anon key; RLS is enforced on Supabase.
export const supabaseAdmin = createClient(
  supabaseUrl,
  anonKey,
  {
    auth: { persistSession: false },
    global: {
      fetch: customFetch
    }
  }
)

/**
 * Create a Supabase client that sends the user's JWT so RLS sees the request as that user.
 * Use this in API routes after validating the token so that queries (e.g. area_downloads,
 * bid_applications) respect RLS policies that filter by auth.uid().
 */
export function createServerSupabaseClient(accessToken: string) {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      fetch: customFetch,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}


