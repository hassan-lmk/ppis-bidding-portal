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

export async function POST (req: NextRequest) {
  try {
    // PayFast sends form-encoded data, not JSON
    const formData = await req.formData()
    const body: Record<string, any> = {}
    formData.forEach((v, k) => { body[k] = v })
    
    // Log for debugging (remove in production)
    console.log('PayFast IPN received:', JSON.stringify(body, null, 2))
    
    // Extract all PayFast IPN parameters (support both lowercase and uppercase keys)
    const basketId = (body.basket_id as string) || (body.BASKET_ID as string) || ''
    const errCode = (body.err_code as string) || (body.ERROR_CODE as string) || ''
    const errMsg = (body.err_msg as string) || (body.ERROR_MESSAGE as string) || ''
    const txId = (body.transaction_id as string) || (body.TRANSACTION_ID as string) || ''
    const transactionCurrency = ((body.transaction_currency as string) || (body.TRANSACTION_CURRENCY as string) || 'USD').toUpperCase()
    // PayFast's converted amount (PKR) - IGNORE THIS for validation
    const transactionAmount = Number(body.transaction_amount || body.AMOUNT || 0)
    // The original USD amount we sent - ALWAYS USE THIS
    const merchantAmount = Number(body.merchant_amount || body.MERCHANT_AMOUNT || 0)
    
    // CRITICAL: ALWAYS use merchant_amount for validation (what we sent in USD)
    // PayFast converts USD to PKR internally and returns transaction_amount in PKR
    // We completely ignore transaction_amount - it's only for PayFast's internal processing
    // merchant_amount is the original USD amount we sent - this is what we validate against
    // Only fallback to transactionAmount if merchantAmount is missing (shouldn't happen)
    const amount = merchantAmount && merchantAmount > 0 ? merchantAmount : transactionAmount
    const hash = (
      (body.validation_hash as string) ||
      (body.invoice_validation_hash as string) ||
      (body.INVOICE_VALIDATION_HASH as string) ||
      ''
    ).toLowerCase()
    const orderDate = body.order_date as string || ''
    const paymentName = body.PaymentName as string || ''
    const discountedAmount = Number(body.discounted_amount || 0)

    // Use shared Supabase admin client with TLS handling
    const { supabaseAdmin } = await import('../../../lib/supabase')
    const supabase = supabaseAdmin

    // Save IPN data to payfast_ipn_logs table FIRST (before any processing)
    // This ensures we have a record of all IPN requests, even if processing fails
    let ipnLogId: string | undefined
    try {
      const ipnLogData = {
        basket_id: basketId || null,
        transaction_id: txId || null,
        err_code: errCode || null,
        err_msg: errMsg || null,
        merchant_amount: merchantAmount > 0 ? merchantAmount : null,
        transaction_amount: transactionAmount > 0 ? transactionAmount : null,
        transaction_currency: transactionCurrency || null,
        discounted_amount: discountedAmount > 0 ? discountedAmount : null,
        payment_method: paymentName || body.PaymentName || null,
        issuer_name: body.issuer_name || null,
        masked_pan: body.masked_pan || null,
        email_address: body.email_address || null,
        mobile_no: body.mobile_no || null,
        customer_id: body.customer_id || null,
        order_date: orderDate ? new Date(orderDate).toISOString() : null,
        bill_number: body.bill_number || null,
        authorization_code: body.authorization_code || null,
        response_key: body.responseKey || body.Response_Key || null,
        validation_hash: hash || null,
        raw_payload: body,
        processed: false, // Will be updated after processing
        validation_passed: false, // Will be updated after validation
        amount_match: false // Will be updated after validation
      }

      const { error: ipnLogError, data: ipnLogDataInserted } = await supabase
        .from('payfast_ipn_logs')
        .insert(ipnLogData)
        .select()
        .single()

      if (ipnLogError) {
        console.error('[IPN] Error saving IPN log:', ipnLogError)
      } else {
        console.log('[IPN] IPN log saved with ID:', ipnLogDataInserted?.id)
        ipnLogId = ipnLogDataInserted?.id
      }
    } catch (ipnLogErr: any) {
      console.error('[IPN] Exception saving IPN log:', ipnLogErr)
      // Continue processing even if log save fails
    }

    // Always return 200 per PayFast documentation requirement
    if (!basketId || !hash) {
      console.log('[IPN] Missing basket_id or validation_hash, returning 200')
      return NextResponse.json({ ok: true })
    }

    // Validate hash format: basket_id|secured_key|merchant_id|err_code
    const expected = computeValidationHash(basketId, errCode || '')
    const isValid = hash.toLowerCase() === expected.toLowerCase()
    
    // Log detailed hash validation
    const hashString = `${basketId}|${requireEnv('PAYFAST_SECURED_KEY')}|${requireEnv('PAYFAST_MERCHANT_ID')}|${errCode || ''}`
    console.log('[IPN] Hash validation details:', {
      basketId,
      errCode: errCode || '(empty)',
      hashString: hashString.substring(0, 50) + '...',
      receivedHash: hash,
      expectedHash: expected,
      isValid,
      hashLength: { received: hash.length, expected: expected.length }
    })
    
    if (!isValid) {
      console.warn('[IPN] ⚠️ Hash validation FAILED:', {
        basketId,
        received: hash.substring(0, 20) + '...' + hash.substring(hash.length - 20),
        expected: expected.substring(0, 20) + '...' + expected.substring(expected.length - 20)
      })
    } else {
      console.log('[IPN] ✅ Hash validation PASSED')
    }

    const { data: orders } = await supabase.from('orders').select('*').eq('basket_id', basketId).limit(1)
    const order = orders && orders[0]
    if (!order) {
      console.log('[IPN] Order not found for basket_id:', basketId)
      // Update IPN log if we have the ID
      if (ipnLogId) {
        await supabase.from('payfast_ipn_logs').update({
          processing_error: 'Order not found for basket_id',
          processed: true
        }).eq('id', ipnLogId)
      }
      return NextResponse.json({ ok: true })
    }

    // Verify amount matches (with small tolerance for rounding)
    // CRITICAL: We ONLY validate against merchant_amount (what we sent in USD)
    // transaction_amount is PayFast's PKR conversion - we completely ignore it
    const amountDiff = Math.abs(Number(order.total_amount) - amount)
    const amountMatches = amountDiff < 0.01 // Allow 0.01 USD tolerance for rounding

    console.log('[IPN] Payment validation check:', {
      isValid,
      errCode,
      amountMatches,
      amountDiff: amountDiff,
      orderAmount_USD: order.total_amount,
      merchantAmount_USD: merchantAmount,
      transactionAmount_PKR: transactionAmount,
      validatingWith: amount,
      transactionCurrency,
      usingField: merchantAmount > 0 ? 'merchant_amount (USD)' : 'transaction_amount (fallback)',
      willProcess: isValid && errCode === '000' && amountMatches
    })

    // Update IPN log with validation results
    if (ipnLogId) {
      await supabase.from('payfast_ipn_logs').update({
        validation_passed: isValid,
        amount_match: amountMatches
      }).eq('id', ipnLogId)
    }

    if (isValid && errCode === '000' && amountMatches) {
      // Check if payment already processed (idempotency check)
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('transaction_id', txId)
        .single()

      if (existingPayment) {
        console.log('[IPN] Payment already processed, ignoring duplicate transaction:', txId)
        // Update IPN log
        if (ipnLogId) {
          await supabase.from('payfast_ipn_logs').update({
            processed: true,
            processed_at: new Date().toISOString(),
            processing_error: 'Duplicate transaction - already processed'
          }).eq('id', ipnLogId)
        }
        return NextResponse.json({ ok: true })
      }

      // Check if order is already paid
      if (order.status === 'paid') {
        console.log('[IPN] Order already paid, ignoring duplicate IPN:', basketId)
        if (ipnLogId) {
          await supabase.from('payfast_ipn_logs').update({
            processed: true,
            processed_at: new Date().toISOString(),
            processing_error: 'Duplicate IPN - order already paid'
          }).eq('id', ipnLogId)
        }
        return NextResponse.json({ ok: true })
      }

      // Successful payment
      console.log('[IPN] Processing successful payment for order:', order.id)
      
      const { error: orderUpdateError } = await supabase.from('orders').update({ 
        status: 'paid', 
        txnid: txId, 
        err_code: errCode,
        err_msg: errMsg || null
      }).eq('id', order.id)
      
      if (orderUpdateError) {
        console.error('[IPN] Error updating order:', orderUpdateError)
      } else {
        console.log('[IPN] Order status updated to paid')
      }
      
      const { error: paymentInsertError } = await supabase.from('payments').insert({ 
        order_id: order.id, 
        transaction_id: txId, 
        amount, // Use the corrected amount (merchant_amount in USD)
        currency: 'USD', // Always USD - we send USD and merchant_amount is in USD
        status: 'captured', 
        raw_payload: body 
      })
      
      if (paymentInsertError) {
        console.error('[IPN] Error inserting payment:', paymentInsertError)
        // Update IPN log with error
        if (ipnLogId) {
          await supabase.from('payfast_ipn_logs').update({
            processed: true,
            processing_error: `Payment insert failed: ${paymentInsertError.message}`
          }).eq('id', ipnLogId)
        }
      } else {
        console.log('[IPN] Payment record created')
        // Update IPN log - payment processed successfully
        if (ipnLogId) {
          await supabase.from('payfast_ipn_logs').update({
            processed: true,
            processed_at: new Date().toISOString()
          }).eq('id', ipnLogId)
        }
      }
      
      // Fetch order items
      console.log('[IPN] Fetching order items for order_id:', order.id)
      const { data: items, error: itemsError } = await supabase.from('order_items').select('area_id, quantity, unit_price').eq('order_id', order.id)
      
      if (itemsError) {
        console.error('[IPN] ❌ ERROR fetching order items:', JSON.stringify(itemsError, null, 2))
      } else {
        console.log('[IPN] ✅ Found', items?.length || 0, 'order items:', items?.map(i => ({ area_id: i.area_id, quantity: i.quantity })))
      }
      
      const downloads: any[] = []
      if (items && items.length > 0) {
        for (const it of items) {
          const qty = Math.max(1, Number(it.quantity || 1))
          console.log('[IPN] Processing item:', { area_id: it.area_id, quantity: qty })
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
      } else {
        console.warn('[IPN] ⚠️ No order items found - cannot create downloads')
      }
      
      console.log('[IPN] Prepared', downloads.length, 'download entries to insert')
      
      if (downloads.length > 0) {
        // Check if downloads already exist (trigger may have already created them)
        console.log('[IPN] Checking if downloads already exist for order_id:', order.id)
        const { data: existing, error: existingError } = await supabase
          .from('area_downloads')
          .select('id')
          .eq('order_id', order.id)
          .limit(1)
        
        if (existingError) {
          console.error('[IPN] Error checking existing downloads:', existingError)
        } else if (existing && existing.length > 0) {
          console.log('[IPN] ✅ Downloads already exist (likely created by trigger), skipping insert')
        } else {
          console.log('[IPN] No existing downloads found, attempting insert...')
          console.log('[IPN] Download entries to insert:', downloads.map(d => ({ 
            area_id: d.area_id, 
            user_id: d.user_id,
            order_id: d.order_id 
          })))
          
          const { data: downloadData, error: downloadError } = await supabase
            .from('area_downloads')
            .insert(downloads)
            .select()
          
          if (downloadError) {
            console.error('[IPN] ❌ ERROR inserting area_downloads:', JSON.stringify(downloadError, null, 2))
            console.error('[IPN] Full error details:', {
              message: downloadError.message,
              details: downloadError.details,
              hint: downloadError.hint,
              code: downloadError.code
            })
            console.error('[IPN] Download payload (first entry):', JSON.stringify(downloads[0] || {}, null, 2))
          } else {
            console.log('[IPN] ✅ Successfully created', downloadData?.length || 0, 'area_downloads entries')
            console.log('[IPN] Created entries:', downloadData?.map(d => ({ id: d.id, area_id: d.area_id })))
          }
        }
      } else {
        console.warn('[IPN] ⚠️ No downloads to create - downloads array is empty')
      }
      
      // Send purchase confirmation email
      try {
        console.log('[IPN] Preparing to send purchase confirmation email...')
        
        // Fetch user information
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(order.user_id)
        if (userError || !userData?.user) {
          console.error('[IPN] Error fetching user data for email:', userError)
        } else {
          const userEmail = userData.user.email
          if (!userEmail) {
            console.error('[IPN] User email not found, cannot send purchase confirmation email')
          } else {
            const userName = userData.user.user_metadata?.display_name || 
                            userData.user.user_metadata?.full_name || 
                            userEmail.split('@')[0] || 
                            'Valued Customer'
            
            // Fetch area details with zone and block information
            if (items && items.length > 0) {
            const areaIds = items.map(it => it.area_id)
            const { data: areasData, error: areasError } = await supabase
              .from('areas')
              .select(`
                id,
                name,
                code,
                price,
                zones!inner(
                  name,
                  blocks!inner(
                    name,
                    type
                  )
                )
              `)
              .in('id', areaIds)
            
            if (areasError) {
              console.error('[IPN] Error fetching area details for email:', areasError)
            } else if (areasData && areasData.length > 0) {
              // Build purchased items array
              const purchasedItems = items.map(item => {
                const area = areasData.find(a => a.id === item.area_id)
                // Handle zones as array or single object
                const zones = (area as any)?.zones
                const zone = Array.isArray(zones) ? zones[0] : zones
                // Handle blocks as array or single object
                const blocks = zone?.blocks
                const block = Array.isArray(blocks) ? blocks[0] : blocks
                
                return {
                  areaName: area?.name || 'Unknown Area',
                  areaCode: area?.code || '',
                  blockName: block?.name,
                  zoneName: zone?.name,
                  quantity: Math.max(1, Number(item.quantity || 1)),
                  unitPrice: Number(item.unit_price || area?.price || 0)
                }
              })
              
              // Import email functions
              const { sendEmail, getPurchaseConfirmationEmailTemplate } = await import('../../../lib/email')
              
              // Generate email template
              // Always use USD for email display since we charge in USD
              // amount is already in USD (merchant_amount)
              const emailTemplate = getPurchaseConfirmationEmailTemplate(
                userName,
                order.basket_id,
                txId,
                amount,
                'USD',
                purchasedItems
              )
              
              // Send email
              const emailResult = await sendEmail({
                to: userEmail,
                subject: emailTemplate.subject,
                html: emailTemplate.html,
                text: emailTemplate.text
              })
              
              if (emailResult.success) {
                console.log('[IPN] ✅ Purchase confirmation email sent successfully to:', userEmail)
              } else {
                console.error('[IPN] ❌ Failed to send purchase confirmation email:', emailResult.error)
              }
            }
          }
        }
      }
      } catch (emailError: any) {
        // Don't fail the IPN processing if email fails
        console.error('[IPN] Error sending purchase confirmation email:', emailError?.message || emailError)
      }
    } else {
      // Failed payment - store error details
      const failureReason = !isValid ? 'validation hash mismatch' : 
                           !amountMatches ? `amount mismatch (expected ${order.total_amount}, got ${amount})` :
                           errMsg || 'gateway error'
      
      await supabase.from('orders').update({ 
        status: 'failed', 
        err_code: errCode || null, 
        err_msg: errMsg || failureReason
      }).eq('id', order.id)
      
      await supabase.from('payments').insert({ 
        order_id: order.id, 
        transaction_id: txId || null, 
        amount, // Use the corrected amount
        currency: 'USD', // Always USD - we send USD and merchant_amount is in USD
        status: 'failed', 
        raw_payload: body 
      })
      
      // Update IPN log with failure reason
      if (ipnLogId) {
        await supabase.from('payfast_ipn_logs').update({
          processed: true,
          processed_at: new Date().toISOString(),
          processing_error: failureReason
        }).eq('id', ipnLogId)
      }
      
      console.log('[IPN] Payment failed:', { errCode, errMsg, isValid, amountMatches, reason: failureReason })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[IPN] Unexpected error:', e.message, e.stack)
    // Always return 200 to PayFast even on errors
    return NextResponse.json({ ok: true })
  }
}


