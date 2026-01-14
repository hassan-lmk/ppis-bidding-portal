import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../_supabaseAdmin'
import crypto from 'crypto'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env ${key}`)
  return v
}

function computeValidationHash(basketId: string, errCode: string): string {
  const data = `${basketId}|${requireEnv('PAYFAST_SECURED_KEY')}|${requireEnv('PAYFAST_MERCHANT_ID')}|${errCode}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

// GET /api/bid-applications/[id]/payment/return - PayFast return redirect
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const { id } = await params
  const { searchParams } = new URL(request.url)
    const basketId = searchParams.get('basket_id') || ''
    const errCode = searchParams.get('err_code') || ''
    const errMsg = searchParams.get('err_msg') || ''
    const transactionId = searchParams.get('transaction_id') || ''
    const hash = (searchParams.get('validation_hash') || '').toLowerCase()
    const merchantAmount = searchParams.get('merchant_amount')
    const transactionAmount = searchParams.get('transaction_amount')

  const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ''

    // Log received parameters
    console.log('[Bid Payment Return] Received params:', {
      applicationId: id,
      basketId,
      errCode,
      errMsg,
      transactionId,
      hasHash: !!hash
    })

  // Get the application
  const { data: app } = await (supabaseAdmin as any)
    .from('bid_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!app) {
    return NextResponse.redirect(`${appBase}/bid-submission/${id}?payment=error&message=Application+not+found`)
  }

    // Validate hash if present
    let isValid = false
    if (basketId && hash) {
      const expected = computeValidationHash(basketId, errCode)
      isValid = hash.toLowerCase() === expected.toLowerCase()
      
      const hashString = `${basketId}|${requireEnv('PAYFAST_SECURED_KEY')}|${requireEnv('PAYFAST_MERCHANT_ID')}|${errCode}`
      console.log('[Bid Payment Return] Hash validation details:', {
        applicationId: id,
        basketId,
        errCode,
        hashString: hashString.substring(0, 50) + '...',
        receivedHash: hash,
        expectedHash: expected,
        isValid,
        hashLength: { received: hash.length, expected: expected.length }
      })
      
      if (!isValid) {
        console.warn('[Bid Payment Return] ⚠️ Hash validation FAILED')
      } else {
        console.log('[Bid Payment Return] ✅ Hash validation PASSED')
      }
    }

    // FALLBACK: If hash is valid and payment succeeded, but IPN hasn't processed yet,
    // we can verify and process the payment here as a fallback.
    if (isValid && errCode === '000' && basketId && transactionId) {
      try {
        // Check if payment already processed (idempotency)
        if (app.application_fee_status !== 'paid') {
          const expectedAmount = app.application_fee_amount || 100000 // 100,000 PKR
          const receivedAmount = merchantAmount ? Number(merchantAmount) : (transactionAmount ? Number(transactionAmount) : expectedAmount)
          const amountDiff = Math.abs(expectedAmount - receivedAmount)
          const amountMatches = amountDiff < 1 // Allow 1 PKR tolerance for rounding
          
          if (amountMatches) {
            console.log('[Bid Payment Return] Fallback: Processing payment (IPN not received yet)', {
              applicationId: id,
              basketId,
              transactionId,
              expectedAmount,
              receivedAmount
            })
            
            // Collect all return parameters as raw_payload
            const rawPayload = Object.fromEntries(searchParams.entries())
            
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

            console.log('[Bid Payment Return] ✅ Fallback payment processing completed')
          } else {
            console.warn('[Bid Payment Return] Fallback: Amount mismatch, skipping:', {
              expectedAmount,
              receivedAmount,
              difference: amountDiff
            })
          }
        } else {
          console.log('[Bid Payment Return] Fallback: Payment already processed, skipping')
        }
      } catch (fallbackError: any) {
        console.error('[Bid Payment Return] Fallback processing error:', fallbackError.message)
        // Continue with redirect even if fallback fails
      }
    }

    // Redirect based on payment status
    if (errCode === '000') {
      // Payment successful
    return NextResponse.redirect(`${appBase}/bid-submission/${app.area_id}?payment=success`)
  } else {
    // Payment failed
      const errorMessage = errMsg || 'Payment failed'
    return NextResponse.redirect(
      `${appBase}/bid-submission/${app.area_id}?payment=failed&message=${encodeURIComponent(errorMessage)}`
    )
    }
  } catch (e: any) {
    console.error('[Bid Payment Return] Error:', e.message, e.stack)
    const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    try {
      const { id } = await params
      return NextResponse.redirect(`${appBase}/bid-submission/${id}?payment=error`)
    } catch {
      return NextResponse.redirect(`${appBase}/bid-submission?payment=error`)
    }
  }
}

// POST /api/bid-applications/[id]/payment/return - PayFast POST return
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const formData = await request.formData()
    const errCode = (formData.get('err_code') as string) || ''
    const errMsg = (formData.get('err_msg') as string) || ''
    const transactionId = (formData.get('transaction_id') as string) || ''
    const basketId = (formData.get('basket_id') as string) || ''
    const hash = ((formData.get('validation_hash') as string) || '').toLowerCase()
    const merchantAmount = formData.get('merchant_amount')
    const transactionAmount = formData.get('transaction_amount')

    const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ''

    // Log received parameters
    console.log('[Bid Payment Return POST] Received params:', {
      applicationId: id,
      basketId,
      errCode,
      errMsg,
      transactionId,
      hasHash: !!hash
    })

    // Get the application
    const { data: app } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!app) {
      return NextResponse.redirect(`${appBase}/bid-submission/${id}?payment=error&message=Application+not+found`)
    }

    // Validate hash if present
    let isValid = false
    if (basketId && hash) {
      const expected = computeValidationHash(basketId, errCode)
      isValid = hash.toLowerCase() === expected.toLowerCase()
      
      if (!isValid) {
        console.warn('[Bid Payment Return POST] ⚠️ Hash validation FAILED')
      } else {
        console.log('[Bid Payment Return POST] ✅ Hash validation PASSED')
      }
    }

    // FALLBACK: Process payment if hash is valid and payment succeeded
    if (isValid && errCode === '000' && basketId && transactionId) {
      try {
        if (app.application_fee_status !== 'paid') {
          const expectedAmount = app.application_fee_amount || 100000
          const receivedAmount = merchantAmount ? Number(merchantAmount) : (transactionAmount ? Number(transactionAmount) : expectedAmount)
          const amountDiff = Math.abs(expectedAmount - receivedAmount)
          const amountMatches = amountDiff < 1
          
          if (amountMatches) {
            console.log('[Bid Payment Return POST] Fallback: Processing payment')
            // Collect all form data as raw_payload
            const rawPayload = Object.fromEntries(formData.entries())
            
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
            console.log('[Bid Payment Return POST] ✅ Fallback payment processing completed')
          }
        }
      } catch (fallbackError: any) {
        console.error('[Bid Payment Return POST] Fallback processing error:', fallbackError.message)
      }
    }

    // Redirect based on payment status
    if (errCode === '000') {
      return NextResponse.redirect(`${appBase}/bid-submission/${app.area_id}?payment=success`)
    } else {
      return NextResponse.redirect(
        `${appBase}/bid-submission/${app.area_id}?payment=failed&message=${encodeURIComponent(errMsg || 'Payment failed')}`
      )
    }
  } catch (error: any) {
    console.error('[Bid Payment Return POST] Error:', error.message, error.stack)
    const appBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    try {
      const { id } = await params
    return NextResponse.redirect(`${appBase}/bid-submission/${id}?payment=error`)
    } catch {
      return NextResponse.redirect(`${appBase}/bid-submission?payment=error`)
    }
  }
}







