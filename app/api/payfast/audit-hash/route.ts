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

/**
 * Diagnostic endpoint to audit PayFast hash validation
 * 
 * Usage: GET /api/payfast/audit-hash?basket_id=ORD-XXX&err_code=000&validation_hash=xxx
 * 
 * This helps debug hash validation issues by showing:
 * - The exact string being hashed
 * - Expected vs received hash
 * - Detailed comparison
 */
export async function GET (req: NextRequest) {
  try {
    const url = new URL(req.url)
    const basketId = url.searchParams.get('basket_id') || ''
    const errCode = url.searchParams.get('err_code') || '000'
    const receivedHash = url.searchParams.get('validation_hash') || ''
    
    if (!basketId) {
      return NextResponse.json({ 
        error: 'Missing basket_id parameter',
        usage: 'GET /api/payfast/audit-hash?basket_id=ORD-XXX&err_code=000&validation_hash=xxx'
      }, { status: 400 })
    }
    
    const securedKey = requireEnv('PAYFAST_SECURED_KEY')
    const merchantId = requireEnv('PAYFAST_MERCHANT_ID')
    
    // Build the hash string exactly as PayFast expects
    const hashString = `${basketId}|${securedKey}|${merchantId}|${errCode}`
    const expectedHash = computeValidationHash(basketId, errCode)
    
    const receivedHashLower = receivedHash.toLowerCase()
    const expectedHashLower = expectedHash.toLowerCase()
    const isValid = receivedHashLower === expectedHashLower
    
    // Check order status in database
    let orderStatus = null
    let paymentStatus = null
    try {
      const { supabaseAdmin } = await import('../../../lib/supabase')
      const supabase = supabaseAdmin
      const { data: order } = await supabase
        .from('orders')
        .select('id, status, total_amount')
        .eq('basket_id', basketId)
        .maybeSingle()
      
      if (order) {
        orderStatus = order.status
        
        // Check payment status
        const { data: payment } = await supabase
          .from('payments')
          .select('status, transaction_id')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        if (payment) {
          paymentStatus = payment.status
        }
      }
    } catch (dbError: any) {
      console.error('[Audit] Database error:', dbError.message)
    }
    
    // Check IPN logs
    let ipnLogs = null
    try {
      const { supabaseAdmin } = await import('../../../lib/supabase')
      const supabase = supabaseAdmin
      const { data: logs } = await supabase
        .from('payfast_ipn_logs')
        .select('id, validation_passed, amount_match, processed, processed_at, processing_error')
        .eq('basket_id', basketId)
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (logs) {
        ipnLogs = logs
      }
    } catch (ipnError: any) {
      console.error('[Audit] IPN logs error:', ipnError.message)
    }
    
    return NextResponse.json({
      audit: {
        basketId,
        errCode,
        hashValidation: {
          isValid,
          receivedHash: receivedHash || '(not provided)',
          expectedHash,
          receivedHashLower,
          expectedHashLower,
          match: isValid ? '✅ PASSED' : '❌ FAILED'
        },
        hashString: {
          full: hashString,
          preview: `${basketId}|${securedKey.substring(0, 8)}...|${merchantId}|${errCode}`,
          components: {
            basketId,
            securedKey: `${securedKey.substring(0, 8)}...${securedKey.substring(securedKey.length - 4)}`,
            merchantId,
            errCode
          }
        },
        database: {
          orderStatus,
          paymentStatus,
          ipnLogs: ipnLogs || []
        },
        recommendations: isValid 
          ? ['Hash validation passed. If payment still shows as failed, check IPN processing.']
          : [
              'Hash validation failed. Possible causes:',
              '1. Wrong PAYFAST_SECURED_KEY or PAYFAST_MERCHANT_ID in environment',
              '2. PayFast sent hash in different format',
              '3. Case sensitivity issue (though both are lowercased)',
              '4. Extra whitespace or encoding issues',
              '',
              'Note: IPN endpoint is authoritative - check if IPN processed the payment correctly.'
            ]
      }
    })
  } catch (e: any) {
    return NextResponse.json({ 
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    }, { status: 500 })
  }
}
