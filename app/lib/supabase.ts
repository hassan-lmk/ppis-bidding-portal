import { createClient } from '@supabase/supabase-js'

// Get Supabase URL - handle empty strings and undefined
// Use fallback only if env var is not set or is empty/whitespace
const supabaseUrlRaw = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseUrl = (supabaseUrlRaw && supabaseUrlRaw.trim()) || 'https://ppisapi.lmkr.com/'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseAnonKey || !supabaseAnonKey.trim()) {
  throw new Error('Missing env NEXT_PUBLIC_SUPABASE_ANON_KEY. Please set this environment variable.')
}

// Validate URL format (basic check)
if (!supabaseUrl || supabaseUrl.trim() === '' || (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://'))) {
  throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}". Must be a valid HTTP/HTTPS URL.`)
}

// Custom fetch for server-side with configurable TLS verification
function createServerFetch(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  if (typeof window === 'undefined' && typeof require !== 'undefined') {
    try {
      const https = require('https')
      
      const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true'
      const isProduction = process.env.NODE_ENV === 'production'
      const rejectUnauthorized = isProduction && !allowInsecure

      if (allowInsecure && isProduction) {
        console.warn('⚠️  TLS verification disabled - only use in closed/secure environments')
      }
      
      const secureCiphers = [
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

      const agent = new https.Agent({
        rejectUnauthorized,
        keepAlive: true,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
        ciphers: secureCiphers,
        honorCipherOrder: true,
      })
      
      return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.toString()
        const urlObj = new URL(urlStr)
        
        if (urlObj.protocol === 'https:') {
          return new Promise((resolve, reject) => {
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
              agent: agent
            }
            
            const req = https.request(options, (res: any) => {
              const chunks: Buffer[] = []
              res.on('data', (chunk: Buffer) => chunks.push(chunk))
              res.on('end', () => {
                const statusCode = res.statusCode || 200
                const safeStatus = statusCode === 204 ? 200 : (statusCode >= 200 && statusCode < 600 ? statusCode : 200)
                
                const body = Buffer.concat(chunks)
                const headers = new Headers()
                Object.entries(res.headers).forEach(([key, value]) => {
                  if (value && typeof value === 'string') {
                    headers.set(key, value)
                  } else if (Array.isArray(value)) {
                    headers.set(key, value.join(', '))
                  }
                })
                
                resolve(new Response(body.length > 0 ? body : null, {
                  status: safeStatus,
                  statusText: res.statusMessage || (safeStatus === 200 ? 'OK' : ''),
                  headers: headers
                }))
              })
            })
            req.on('error', reject)
            
            if (init?.body) {
              if (typeof init.body === 'string') {
                req.write(init.body)
                req.end()
              } else if (Buffer.isBuffer(init.body)) {
                req.write(init.body)
                req.end()
              } else if (init.body instanceof ReadableStream) {
                const reader = init.body.getReader()
                const pump = async () => {
                  try {
                    while (true) {
                      const { done, value } = await reader.read()
                      if (done) {
                        req.end()
                        break
                      }
                      req.write(Buffer.from(value))
                    }
                  } catch (e) {
                    req.destroy()
                    reject(e)
                  }
                }
                pump()
              } else {
                req.end()
              }
            } else {
              req.end()
            }
          })
        }
        
        return fetch(input, init)
      }
    } catch (e) {
      console.warn('Failed to create custom server fetch:', e)
    }
  }
  
  return fetch
}

// Client for frontend - configured for SSO with main site
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Enable cross-domain session sharing if on same parent domain
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'sb-auth-token',
  }
})

// Server-side client for API routes
export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey ?? supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: createServerFetch()
    }
  }
)
