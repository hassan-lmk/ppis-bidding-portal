import { NextRequest, NextResponse } from 'next/server'

// Utility endpoint to manually create area_downloads for a paid order
// Usage: POST /api/payfast/fix-downloads with { order_id: "uuid" } or { basket_id: "ORD-XXX" }
export async function POST (req: NextRequest) {
  try {
    const { order_id, basket_id } = await req.json()
    
    if (!order_id && !basket_id) {
      return NextResponse.json({ error: 'Must provide order_id or basket_id' }, { status: 400 })
    }

    const { supabaseAdmin } = await import('../../../lib/supabase')
    const supabase = supabaseAdmin

    // Find the order
    let order
    if (basket_id) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('basket_id', basket_id)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }
      order = data
    } else {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      }
      order = data
    }

    if (order.status !== 'paid') {
      return NextResponse.json({ error: `Order status is ${order.status}, not 'paid'` }, { status: 400 })
    }

    // Get order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('area_id, quantity')
      .eq('order_id', order.id)
    
    if (itemsError) throw itemsError
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No order items found' }, { status: 404 })
    }

    // Get payment transaction_id
    const { data: payment } = await supabase
      .from('payments')
      .select('transaction_id')
      .eq('order_id', order.id)
      .eq('status', 'captured')
      .maybeSingle()

    const txId = payment?.transaction_id || null

    // Check if downloads already exist
    const { data: existing } = await supabase
      .from('area_downloads')
      .select('id')
      .eq('order_id', order.id)
    
    if (existing && existing.length > 0) {
      return NextResponse.json({ 
        message: `Downloads already exist (${existing.length} entries)`,
        existing_count: existing.length,
        order_id: order.id,
        basket_id: order.basket_id
      })
    }

    // Create downloads
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

    const { data: downloadData, error: downloadError } = await supabase
      .from('area_downloads')
      .insert(downloads)
      .select()

    if (downloadError) {
      console.error('[Fix Downloads] Error:', downloadError)
      return NextResponse.json({ 
        error: 'Failed to create downloads',
        details: downloadError.message,
        payload: downloads
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      message: `Created ${downloadData?.length || 0} download entries`,
      order_id: order.id,
      basket_id: order.basket_id,
      created_count: downloadData?.length || 0
    })
  } catch (e: any) {
    console.error('[Fix Downloads] Error:', e.message, e.stack)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

