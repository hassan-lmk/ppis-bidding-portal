import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function fetchWithSelfSignedCert(url: string, options: RequestInit = {}) {
  const { default: https } = await import('https')

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const requestOptions: any = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    }

    const req = https.request(requestOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null
          resolve({
            ok: res.statusCode! >= 200 && res.statusCode! < 300,
            status: res.statusCode!,
            statusText: res.statusMessage!,
            json: async () => jsonData,
          } as any)
        } catch (error) {
          reject(error)
        }
      })
    })

    req.on('error', (error) => reject(error))

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }
    req.end()
  })
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ppisapi.lmkr.com').replace(/\/$/, '')
    const appBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000'
    const recoverUrl = `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(`${appBase}/reset-password`)}`

    try {
      await fetchWithSelfSignedCert(recoverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email }),
      })
    } catch (error) {
      console.error('Forgot password recover request failed:', error)
    }

    return NextResponse.json(
      { message: 'If an account exists, a verification code has been sent to your email.' },
      { status: 200 },
    )
  } catch (error) {
    console.error('Forgot password API error:', error)
    return NextResponse.json(
      { message: 'If an account exists, a verification code has been sent to your email.' },
      { status: 200 },
    )
  }
}

