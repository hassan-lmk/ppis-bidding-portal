import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function requireEnv (key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing env ${key}`)
  return v
}

function computeValidationHash (basketId: string, errCode: string) {
  const data = `${basketId}|${requireEnv('PAYFAST_SECURED_KEY')}|${requireEnv('PAYFAST_MERCHANT_ID')}|${errCode}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

export async function GET (req: NextRequest) {
  try {
    const url = new URL(req.url)
    // Extract all PayFast return parameters per documentation (Table 1.2)
    // basket_id should be in URL from our SUCCESS_URL/FAILURE_URL, or from PayFast redirect
    let basketId = url.searchParams.get('basket_id') || ''
    const errCode = url.searchParams.get('err_code') || ''
    const errMsg = url.searchParams.get('err_msg') || ''
    const txId = url.searchParams.get('transaction_id') || ''
    const hash = (url.searchParams.get('validation_hash') || '').toLowerCase()
    const orderDate = url.searchParams.get('order_date') || ''
    const transactionAmount = url.searchParams.get('transaction_amount')
    const merchantAmount = url.searchParams.get('merchant_amount')
    
    // Log for debugging
    console.log('[PayFast Return] Received params:', {
      basketId,
      errCode,
      errMsg,
      txId,
      hasHash: !!hash,
      allParams: Object.fromEntries(url.searchParams.entries())
    })
    
    // If basket_id is missing, try to look it up by transaction_id (if PayFast sent it)
    if (!basketId) {
      if (txId) {
        const { createServiceRoleClient } = await import('../../_supabaseAdmin')
        const supabase = createServiceRoleClient()
        const { data: payment } = await supabase
          .from('payments')
          .select('orders(basket_id)')
          .eq('transaction_id', txId)
          .limit(1)
          .maybeSingle()
        if (payment && Array.isArray(payment.orders) && payment.orders[0]) {
          basketId = payment.orders[0].basket_id
          console.log('[PayFast Return] Found basket_id from transaction_id:', basketId)
        } else if (payment && (payment as any).orders && typeof (payment as any).orders === 'object') {
          basketId = (payment as any).orders.basket_id
          console.log('[PayFast Return] Found basket_id from transaction_id:', basketId)
        }
      }
    }
    
    // Validate hash if both basket_id and hash are present
    // Note: computeValidationHash already returns lowercase hex
    const expected = basketId ? computeValidationHash(basketId, errCode) : ''
    const isValid = hash && expected && hash.toLowerCase() === expected.toLowerCase()
    
    // Log detailed hash validation for debugging
    if (basketId && hash) {
      const hashString = `${basketId}|${requireEnv('PAYFAST_SECURED_KEY')}|${requireEnv('PAYFAST_MERCHANT_ID')}|${errCode}`
      console.log('[PayFast Return] Hash validation details:', {
        basketId,
        errCode,
        hashString: hashString.substring(0, 50) + '...',
        receivedHash: hash,
        expectedHash: expected,
        isValid,
        hashLength: { received: hash.length, expected: expected.length }
      })
      
      if (!isValid) {
        console.warn('[PayFast Return] ⚠️ Hash validation FAILED:', {
          basketId,
          errCode,
          received: hash.substring(0, 20) + '...' + hash.substring(hash.length - 20),
          expected: expected.substring(0, 20) + '...' + expected.substring(expected.length - 20),
          note: 'IPN will be the authoritative source for payment status'
        })
      } else {
        console.log('[PayFast Return] ✅ Hash validation PASSED')
      }
    }
    
    // FALLBACK: If hash is valid and payment succeeded, but IPN hasn't processed yet,
    // we can verify and process the payment here as a fallback.
    // This ensures payments are processed even if IPN is delayed or not called.
    if (isValid && errCode === '000' && basketId && txId) {
      try {
        const { createServiceRoleClient } = await import('../../_supabaseAdmin')
        const supabase = createServiceRoleClient()
        
        // Check if order exists and get its status
        const { data: order } = await supabase
          .from('orders')
          .select('id, status, total_amount, user_id')
          .eq('basket_id', basketId)
          .maybeSingle()
        
        if (order) {
          // Check if payment already exists (idempotency)
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('transaction_id', txId)
            .maybeSingle()
          
          // Only process if:
          // 1. Order is not already paid
          // 2. Payment record doesn't exist
          // 3. Amount matches (validate merchant_amount if available, fallback to transaction_amount)
          if (order.status !== 'paid' && !existingPayment) {
            // Use merchant_amount (USD) if available, otherwise fallback to transaction_amount
            const amount = merchantAmount ? Number(merchantAmount) : (transactionAmount ? Number(transactionAmount) : order.total_amount)
            const amountDiff = Math.abs(Number(order.total_amount) - amount)
            const amountMatches = amountDiff < 0.01 // Allow 0.01 tolerance for rounding
            
            if (amountMatches) {
              console.log('[PayFast Return] Fallback: Processing payment (IPN not received yet)', {
                basketId,
                txId,
                orderAmount: order.total_amount,
                receivedAmount: amount
              })
              
              // Update order status
              const { error: orderUpdateError } = await supabase.from('orders').update({
                status: 'paid',
                txnid: txId,
                err_code: errCode,
                err_msg: errMsg || null
              }).eq('id', order.id)
              
              if (orderUpdateError) {
                console.error('[PayFast Return] Fallback: Error updating order:', orderUpdateError)
              } else {
                console.log('[PayFast Return] Fallback: Order status updated to paid')
              }
              
              // Create payment record
              const { error: paymentInsertError } = await supabase.from('payments').insert({
                order_id: order.id,
                transaction_id: txId,
                amount: order.total_amount, // Use order amount (USD) for consistency
                currency: 'USD',
                status: 'captured',
                raw_payload: Object.fromEntries(url.searchParams.entries())
              })
              
              if (paymentInsertError) {
                console.error('[PayFast Return] Fallback: Error creating payment record:', paymentInsertError)
              } else {
                console.log('[PayFast Return] Fallback: Payment record created')
              }
              
              // Create download records (similar to IPN processing)
              const { data: items, error: itemsError } = await supabase
                .from('order_items')
                .select('area_id, quantity')
                .eq('order_id', order.id)
              
              if (itemsError) {
                console.error('[PayFast Return] Fallback: Error fetching order items:', itemsError)
              } else if (items && items.length > 0) {
                const downloads: any[] = []
                for (const it of items) {
                  const qty = Math.max(1, Number(it.quantity || 1))
                  for (let i = 0; i < qty; i++) {
                    downloads.push({
                      user_id: order.user_id,
                      area_id: it.area_id,
                      order_id: order.id,
                      payment_amount: order.total_amount,
                      payment_method: 'payfast',
                      transaction_id: txId,
                      downloaded_at: null,
                      payment_status: 'completed'
                    })
                  }
                }
                
                if (downloads.length > 0) {
                  // Check if downloads already exist (idempotency)
                  const { data: existing } = await supabase
                    .from('area_downloads')
                    .select('id')
                    .eq('order_id', order.id)
                    .limit(1)
                  
                  if (!existing || existing.length === 0) {
                    const { error: downloadError } = await supabase
                      .from('area_downloads')
                      .insert(downloads)
                    
                    if (downloadError) {
                      console.error('[PayFast Return] Fallback: Error creating download records:', downloadError)
                    } else {
                      console.log('[PayFast Return] Fallback: Created', downloads.length, 'download records')
                    }
                  } else {
                    console.log('[PayFast Return] Fallback: Download records already exist, skipping')
                  }
                }
              } else {
                console.warn('[PayFast Return] Fallback: No order items found, cannot create downloads')
              }
              
              console.log('[PayFast Return] ✅ Fallback payment processing completed')
            } else {
              console.warn('[PayFast Return] Fallback: Amount mismatch, skipping fallback processing:', {
                orderAmount: order.total_amount,
                receivedAmount: amount,
                difference: amountDiff
              })
            }
          } else {
            if (order.status === 'paid') {
              console.log('[PayFast Return] Fallback: Order already paid, skipping fallback processing')
            }
            if (existingPayment) {
              console.log('[PayFast Return] Fallback: Payment already exists, skipping fallback processing')
            }
          }
        } else {
          console.warn('[PayFast Return] Fallback: Order not found for basket_id:', basketId)
        }
      } catch (fallbackError: any) {
        // Don't fail the redirect if fallback processing fails
        // IPN will still process it as the authoritative source
        console.error('[PayFast Return] Fallback processing error:', fallbackError.message, fallbackError.stack)
      }
    }
    
    // IMPORTANT: The return endpoint is NOT the primary source of truth for payment status.
    // The IPN endpoint is authoritative. However, we've added fallback processing above
    // to handle cases where IPN is delayed or not called. The frontend will poll the
    // orders table to get the real status.
    const statusHint = errCode === '000' ? 'success' : 'failed'
    
    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000'
    // Always redirect with basket_id - frontend will poll orders table for real status
    const redirectUrl = `${appBase}/bidding-blocks/payfast-return?status=${statusHint}&basket_id=${encodeURIComponent(basketId)}`
    return NextResponse.redirect(redirectUrl, { status: 302 })
  } catch (e: any) {
    console.error('[PayFast Return] Error:', e.message, e.stack)
    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000'
    const basketId = new URL(req.url).searchParams.get('basket_id') || ''
    return NextResponse.redirect(`${appBase}/bidding-blocks/payfast-return?status=failed&basket_id=${encodeURIComponent(basketId)}`, { status: 302 })
  }
}


