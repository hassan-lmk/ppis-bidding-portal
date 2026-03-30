import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerSupabaseClient } from '../../_supabaseAdmin'

async function getUserAndToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, token: null }
  }

  const token = authHeader.substring(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return { user: null, token: null }
  }

  return { user, token }
}

// GET /api/tickets/[id] - Get a single ticket with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, token } = await getUserAndToken(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = createServerSupabaseClient(token)
    const { id } = await params

    // Use user-scoped client so RLS matches list/create ticket routes (anon key alone has no auth.uid())
    const { data: ticket, error: ticketError } = await supabaseUser
      .from('support_tickets')
      .select(`
        *,
        areas(name, code),
        bid_applications(primary_applicant_name)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabaseUser
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('Error fetching messages:', messagesError)
    }

    // Mark messages as read
    await supabaseUser
      .from('ticket_messages')
      .update({ is_read: true })
      .eq('ticket_id', id)
      .eq('is_admin_reply', true)
      .eq('is_read', false)

    return NextResponse.json({
      ...ticket,
      messages: messages || []
    })
  } catch (error) {
    console.error('Error in GET /api/tickets/[id]:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/tickets/[id] - Add a reply to ticket
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, token } = await getUserAndToken(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = createServerSupabaseClient(token)
    const { id } = await params
    const body = await request.json()
    const { message } = body

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Verify ticket belongs to user
    const { data: ticket } = await supabaseUser
      .from('support_tickets')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    if (ticket.status === 'closed') {
      return NextResponse.json({ error: 'Cannot reply to a closed ticket' }, { status: 400 })
    }

    // Create message
    const { data: newMessage, error } = await supabaseUser
      .from('ticket_messages')
      .insert({
        ticket_id: id,
        sender_id: user.id,
        message,
        is_admin_reply: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating message:', error)
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    }

    // Update ticket status to open if it was awaiting reply
    if (ticket.status === 'awaiting_reply') {
      await supabaseUser
        .from('support_tickets')
        .update({ status: 'open' })
        .eq('id', id)
    }

    return NextResponse.json(newMessage, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/tickets/[id]:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/tickets/[id] - Close a ticket (user action)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, token } = await getUserAndToken(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = createServerSupabaseClient(token)
    const { id } = await params
    const body = await request.json()
    const { status } = body

    // Users can only close their own tickets
    if (status !== 'closed') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data, error } = await supabaseUser
      .from('support_tickets')
      .update({ status: 'closed' })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error closing ticket:', error)
      return NextResponse.json({ error: 'Failed to close ticket' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/tickets/[id]:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
