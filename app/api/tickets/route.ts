import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../lib/supabase'

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  
  const token = authHeader.substring(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  
  if (error || !user) {
    return null
  }
  
  return user
}

// GET /api/tickets - Get user's tickets
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('support_tickets')
      .select(`
        *,
        areas(name, code),
        bid_applications(primary_applicant_name)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching tickets:', error)
      return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/tickets:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/tickets - Create a new ticket
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description, category, priority, area_id, bid_application_id } = body

    if (!subject || !description) {
      return NextResponse.json({ 
        error: 'Subject and description are required' 
      }, { status: 400 })
    }

    // Create ticket
    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: user.id,
        subject,
        description,
        category: category || 'general',
        priority: priority || 'medium',
        area_id: area_id || null,
        bid_application_id: bid_application_id || null,
        status: 'open'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating ticket:', error)
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
    }

    // Create initial message with the description
    await supabaseAdmin
      .from('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: user.id,
        message: description,
        is_admin_reply: false
      })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/tickets:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}







