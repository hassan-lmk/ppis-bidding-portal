import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, supabaseAdmin } from '../../_supabaseAdmin'

function requireEnv (key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env ${key}`)
  return v
}

async function getAccessToken (basketId: string, amount: number) {
  const base = requireEnv('PAYFAST_BASE_URL') || 'https://ipguat.apps.net.pk'
  const url = `${base}/Ecommerce/api/Transaction/GetAccessToken`
  const params = new URLSearchParams()
  params.set('MERCHANT_ID', requireEnv('PAYFAST_MERCHANT_ID'))
  params.set('SECURED_KEY', requireEnv('PAYFAST_SECURED_KEY'))
  params.set('TXNAMT', String(amount))
  params.set('BASKET_ID', basketId)
  params.set('CURRENCY_CODE', 'USD')
  
  // Add timeout (10 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  
  try {
    console.log('[Checkout] Requesting PayFast access token...', { basketId, amount })
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PPIS-Next/PayFast'
    },
    body: params.toString(),
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unable to read error response')
      console.error('[Checkout] PayFast token API error:', {
        status: res.status,
        statusText: res.statusText,
        body: errorText.substring(0, 200)
      })
      throw new Error(`PayFast token HTTP ${res.status}: ${res.statusText}`)
    }
    
    const data = await res.json()
    console.log('[Checkout] PayFast access token received')
    return data as { MERCHANT_ID: string, ACCESS_TOKEN: string }
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      console.error('[Checkout] PayFast token request timeout (10s)')
      throw new Error('PayFast API request timeout - please try again')
    }
    throw error
  }
}

export async function POST (req: NextRequest) {
  try {
    console.log('[Checkout] Starting checkout request')
    const { cart } = await req.json()
    if (!Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing Authorization token' }, { status: 401 })
    }

    // Validate token and bind all DB writes to the authenticated user (RLS-safe).
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(accessToken)
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient(accessToken)
    console.log('[Checkout] Supabase user verified:', user.id)

    console.log('[Checkout] Fetching areas for cart:', cart.map((i: any) => i.areaId))
    const areaIds = cart.map((i: any) => i.areaId)
    
    console.log('[Checkout] Executing Supabase query...')
    const { data: areas, error } = await supabase.from('areas').select('id, price').in('id', areaIds)
    if (error) {
      console.error('[Checkout] Supabase query error:', JSON.stringify(error, null, 2))
      throw error
    }
    console.log('[Checkout] Found areas:', areas?.length)

    const priceMap = new Map((areas || []).map(a => [a.id, Number(a.price || 0)]))
    let totalUsd = 0
    for (const item of cart) totalUsd += (priceMap.get(item.areaId) || 0) * Math.max(1, Number(item.quantity || 1))
    // Round to 2 decimal places for USD
    const amountUsd = Math.round(totalUsd * 100) / 100

    const basketId = `ORD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`

    // Create order + items (store amount in USD, but we'll convert to cents/smallest unit if needed)
    // Note: total_amount is stored as numeric, so we can store USD directly
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({ user_id: user.id, basket_id: basketId, total_amount: amountUsd, status: 'pending' })
      .select('*')
      .single()
    if (orderErr) throw orderErr
    const items = cart.map((i: any) => ({ order_id: order.id, area_id: i.areaId, unit_price: priceMap.get(i.areaId) || 0, quantity: Math.max(1, Number(i.quantity || 1)) }))
    const { error: itemsErr } = await supabase.from('order_items').insert(items)
    if (itemsErr) {
      console.error('[Checkout] Error inserting order items:', JSON.stringify(itemsErr, null, 2))
      throw itemsErr
    }
    console.log('[Checkout] Order and items created successfully')

    // PayFast token - send USD amount
    console.log('[Checkout] Calling PayFast API for access token...')
    const tokenRes = await getAccessToken(basketId, amountUsd)
    console.log('[Checkout] PayFast access token received successfully')

    const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL
    const backendBase = process.env.BACKEND_BASE_URL || appBase
    if (!backendBase) {
      throw new Error('BACKEND_BASE_URL is not configured')
    }
    const orderDate = new Date().toISOString().slice(0, 19).replace('T', ' ')

    const form: Record<string, string> = {
      MERCHANT_ID: requireEnv('PAYFAST_MERCHANT_ID'),
      MERCHANT_NAME: 'PPIS',
      TOKEN: tokenRes.ACCESS_TOKEN,
      PROCCODE: '00',
      TXNAMT: String(amountUsd),
      CUSTOMER_MOBILE_NO: '',
      CUSTOMER_EMAIL_ADDRESS: '',
      SIGNATURE: 'ppis-signature',
      VERSION: 'PPIS-0.1',
      TXNDESC: 'Bidding documents',
      SUCCESS_URL: `${backendBase}/api/payfast/return?basket_id=${encodeURIComponent(basketId)}`,
      FAILURE_URL: `${backendBase}/api/payfast/return?basket_id=${encodeURIComponent(basketId)}`,
      CHECKOUT_URL: `${backendBase}/api/payfast/ipn`,
      BASKET_ID: basketId,
      ORDER_DATE: orderDate,
      CURRENCY_CODE: 'USD',
      TRAN_TYPE: 'ECOMM_PURCHASE'
    }
    const actionUrl = `${requireEnv('PAYFAST_BASE_URL') || 'https://ipguat.apps.net.pk'}/Ecommerce/api/Transaction/PostTransaction`

    console.log('[Checkout] Success, returning form data')
    return NextResponse.json({ actionUrl, form, basketId, orderId: order.id })
  } catch (e: any) {
    console.error('[Checkout] Error:', {
      message: e.message,
      name: e.name,
      stack: e.stack,
      code: e.code,
      cause: e.cause
    })
    
    // Provide more specific error messages
    let errorMessage = e.message || 'Server error'
    if (e.message?.includes('timeout')) {
      errorMessage = 'Payment gateway timeout - please try again'
    } else if (e.message?.includes('PayFast')) {
      errorMessage = `Payment gateway error: ${e.message}`
    } else if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
      errorMessage = 'Unable to connect to payment gateway - please try again'
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    }, { status: 500 })
  }
}


