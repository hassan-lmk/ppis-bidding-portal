import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerSupabaseClient } from '../../_supabaseAdmin'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

// Validate JWT and return user + token so DB queries run with RLS as that user
async function getUserAndTokenFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, token: null }
  }

  const token = authHeader.substring(7)
  const { data: { user }, error } = await (supabaseAdmin as any).auth.getUser(token)

  if (error || !user) {
    return { user: null, token: null }
  }

  return { user, token }
}

// GET /api/bidding-portal/closing-date - Get bid submission closing date
// This endpoint is read-only but requires authentication for security
export async function GET(request: NextRequest) {
  try {
    const { user, token } = await getUserAndTokenFromRequest(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Must use user JWT: anon client without session cannot read bid_opening_settings under RLS
    const supabaseUser = createServerSupabaseClient(token)

    const { data, error } = await supabaseUser
      .from('bid_opening_settings')
      .select('bid_submission_closing_date')
      .maybeSingle()

    if (error) {
      console.error('Error fetching closing date:', error)
      return NextResponse.json({ error: 'Failed to fetch closing date' }, { status: 500 })
    }

    // Return the closing date (can be null if not set)
    return NextResponse.json({ 
      bid_submission_closing_date: data?.bid_submission_closing_date || null 
    })
  } catch (error) {
    console.error('Error in GET /api/bidding-portal/closing-date:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
