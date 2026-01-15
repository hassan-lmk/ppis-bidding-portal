import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabase'
import crypto from 'crypto'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

// POST /api/bid-applications/[id]/payment/ipn - PayFast IPN callback
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const formData = await request.formData()
    
    // Extract IPN parameters
    const transactionId = formData.get('transaction_id') as string
    const errCode = formData.get('err_code') as string
    const errMsg = formData.get('err_msg') as string
    const basketId = formData.get('basket_id') as string
    const orderDate = formData.get('order_date') as string
    const validationHash = formData.get('validation_hash') as string
    const paymentName = formData.get('PaymentName') as string
    const transactionAmount = formData.get('transaction_amount') as string

    console.log('[Bid Payment IPN] Received:', {
      applicationId: id,
      transactionId,
      errCode,
      basketId,
      paymentName,
      transactionAmount
    })

    // Log IPN for debugging
    try {
      await (supabaseAdmin as any).from('payfast_ipn_logs').insert({
        basket_id: basketId,
        transaction_id: transactionId,
        err_code: errCode,
        err_msg: errMsg,
        raw_data: Object.fromEntries(formData.entries()),
        created_at: new Date().toISOString()
      })
    } catch (logError) {
      console.error('[Bid Payment IPN] Failed to log:', logError)
    }

    // Validate the hash
    const merchantSecretKey = process.env.PAYFAST_SECURED_KEY
    const merchantId = process.env.PAYFAST_MERCHANT_ID

    let isValid = false
    if (merchantSecretKey && merchantId && validationHash) {
      const hashString = `${basketId}|${merchantSecretKey}|${merchantId}|${errCode}`
      const calculatedHash = crypto.createHash('sha256').update(hashString).digest('hex')
      isValid = calculatedHash.toLowerCase() === validationHash.toLowerCase()

      console.log('[Bid Payment IPN] Hash validation details:', {
        applicationId: id,
        basketId,
        errCode: errCode || '(empty)',
        hashString: hashString.substring(0, 50) + '...',
        receivedHash: validationHash,
        expectedHash: calculatedHash,
        isValid,
        hashLength: { received: validationHash.length, expected: calculatedHash.length }
      })

      if (!isValid) {
        console.warn('[Bid Payment IPN] ⚠️ Hash validation FAILED:', {
          received: validationHash.substring(0, 20) + '...' + validationHash.substring(validationHash.length - 20),
          expected: calculatedHash.substring(0, 20) + '...' + calculatedHash.substring(calculatedHash.length - 20)
        })
        return new NextResponse('Hash validation failed', { status: 400 })
      } else {
        console.log('[Bid Payment IPN] ✅ Hash validation PASSED')
      }
    } else {
      console.warn('[Bid Payment IPN] Missing hash validation parameters')
    }

    // Get the application
    const { data: app } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!app) {
      console.error('[Bid Payment IPN] Application not found:', id)
      return new NextResponse('Application not found', { status: 404 })
    }

    // Collect all IPN form data as raw_payload
    const rawPayload = Object.fromEntries(formData.entries())

    // Update application based on payment result
    if (errCode === '000') {
      // Payment successful
      await (supabaseAdmin as any)
        .from('bid_applications')
        .update({
          application_fee_status: 'paid',
          payment_transaction_id: transactionId,
          payment_paid_at: new Date().toISOString(),
          payment_raw_payload: rawPayload,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      console.log('[Bid Payment IPN] Payment successful for application:', id)
    } else {
      // Payment failed - still save raw_payload for audit
      await (supabaseAdmin as any)
        .from('bid_applications')
        .update({
          application_fee_status: 'failed',
          payment_raw_payload: rawPayload,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      console.log('[Bid Payment IPN] Payment failed for application:', id, 'Error:', errMsg)
    }

    // Return 200 OK as per IPN specification
    return new NextResponse('OK', { status: 200 })
  } catch (error) {
    console.error('[Bid Payment IPN] Error:', error)
    return new NextResponse('Server error', { status: 500 })
  }
}







