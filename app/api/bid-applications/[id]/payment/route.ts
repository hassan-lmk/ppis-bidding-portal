import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabase'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env ${key}`)
  return v
}

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  
  const token = authHeader.substring(7)
  const { data: { user }, error } = await (supabaseAdmin as any).auth.getUser(token)
  
  if (error || !user) {
    return null
  }
  
  return user
}

// Get PayFast access token
async function getAccessToken(basketId: string, amount: number) {
  const base = requireEnv('PAYFAST_BASE_URL') || 'https://ipguat.apps.net.pk'
  const url = `${base}/Ecommerce/api/Transaction/GetAccessToken`
  const params = new URLSearchParams()
  params.set('MERCHANT_ID', requireEnv('PAYFAST_MERCHANT_ID'))
  params.set('SECURED_KEY', requireEnv('PAYFAST_SECURED_KEY'))
  params.set('TXNAMT', String(amount))
  params.set('BASKET_ID', basketId)
  params.set('CURRENCY_CODE', 'PKR') // Using PKR for bid application fee
  
  // Add timeout (10 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  
  try {
    console.log('[Bid Payment] Requesting PayFast access token...', { basketId, amount })
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
      console.error('[Bid Payment] PayFast token API error:', {
        status: res.status,
        statusText: res.statusText,
        body: errorText.substring(0, 200)
      })
      throw new Error(`PayFast token HTTP ${res.status}: ${res.statusText}`)
    }
    
    const data = await res.json()
    console.log('[Bid Payment] PayFast access token received')
    return data as { MERCHANT_ID: string, ACCESS_TOKEN: string }
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      console.error('[Bid Payment] PayFast token request timeout (10s)')
      throw new Error('PayFast API request timeout - please try again')
    }
    throw error
  }
}

// POST /api/bid-applications/[id]/payment - Initiate online payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { payment_method } = body

    // Get application
    const { data: app } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        area:areas(id, name, code)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (app.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Cannot process payment for submitted application' 
      }, { status: 400 })
    }

    if (app.application_fee_status === 'paid' || app.application_fee_status === 'verified') {
      return NextResponse.json({ 
        error: 'Application fee has already been paid' 
      }, { status: 400 })
    }

    // Online payment via PayFast
    if (payment_method === 'online') {
      const amount = app.application_fee_amount || 100000 // 100,000 PKR
      const basketId = `BID-${id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`

      // Get PayFast token
      console.log('[Bid Payment] Calling PayFast API for access token...')
      const tokenRes = await getAccessToken(basketId, amount)
      console.log('[Bid Payment] PayFast access token received successfully')

      const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL
      const backendBase = process.env.BACKEND_BASE_URL || appBase
      
      if (!backendBase) {
        throw new Error('BACKEND_BASE_URL is not configured')
      }

      const orderDate = new Date().toISOString().slice(0, 19).replace('T', ' ')

      // Build PayFast form
      const form: Record<string, string> = {
        MERCHANT_ID: requireEnv('PAYFAST_MERCHANT_ID'),
        MERCHANT_NAME: 'PPIS',
        TOKEN: tokenRes.ACCESS_TOKEN,
        PROCCODE: '00',
        TXNAMT: String(amount),
        CUSTOMER_MOBILE_NO: '',
        CUSTOMER_EMAIL_ADDRESS: '',
        SIGNATURE: 'ppis-bid-signature',
        VERSION: 'PPIS-0.1',
        TXNDESC: `Bid Application Fee - ${app.area?.name || 'Block'}`,
        SUCCESS_URL: `${backendBase}/api/bid-applications/${id}/payment/return?basket_id=${encodeURIComponent(basketId)}`,
        FAILURE_URL: `${backendBase}/api/bid-applications/${id}/payment/return?basket_id=${encodeURIComponent(basketId)}`,
        CHECKOUT_URL: `${backendBase}/api/bid-applications/${id}/payment/ipn`,
        BASKET_ID: basketId,
        ORDER_DATE: orderDate,
        CURRENCY_CODE: 'PKR',
        TRAN_TYPE: 'ECOMM_PURCHASE'
      }

      // Store basket_id for later verification
      await (supabaseAdmin as any)
        .from('bid_applications')
        .update({
          payment_transaction_id: basketId,
          payment_method: 'online',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      const actionUrl = `${requireEnv('PAYFAST_BASE_URL') || 'https://ipguat.apps.net.pk'}/Ecommerce/api/Transaction/PostTransaction`

      return NextResponse.json({
        success: true,
        payment_method: 'online',
        actionUrl,
        form,
        basketId
      })
    }

    // Bank challan upload
    if (payment_method === 'bank_challan') {
      const { bank_name, challan_number, challan_date, payment_proof_url } = body

      if (!bank_name || !challan_number || !challan_date || !payment_proof_url) {
        return NextResponse.json({ 
          error: 'Bank name, challan number, date, and payment proof are required' 
        }, { status: 400 })
      }

      // Update application with challan details
      const { error: updateError } = await (supabaseAdmin as any)
        .from('bid_applications')
        .update({
          payment_method: 'bank_challan',
          bank_name,
          challan_number,
          challan_date,
          payment_proof_url,
          application_fee_status: 'paid',
          payment_paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('Error updating challan details:', updateError)
        return NextResponse.json({ error: 'Failed to save challan details' }, { status: 500 })
      }

      // Return updated application
      const { data: updatedApp } = await (supabaseAdmin as any)
        .from('bid_applications')
        .select(`
          *,
          consortium_companies:bid_consortium_companies(*),
          documents:bid_documents(*),
          area:areas(id, name, code, status, bid_submission_deadline)
        `)
        .eq('id', id)
        .single()

      return NextResponse.json({
        success: true,
        payment_method: 'bank_challan',
        application: updatedApp
      })
    }

    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  } catch (error: any) {
    console.error('[Bid Payment] Error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      code: error.code,
      cause: error.cause
    })
    
    // Provide more specific error messages
    let errorMessage = error.message || 'Server error'
    if (error.message?.includes('timeout')) {
      errorMessage = 'Payment gateway timeout - please try again'
    } else if (error.message?.includes('PayFast')) {
      errorMessage = `Payment gateway error: ${error.message}`
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Unable to connect to payment gateway - please try again'
    }
    
    return NextResponse.json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}







