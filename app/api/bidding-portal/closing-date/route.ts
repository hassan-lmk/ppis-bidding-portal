import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../_supabaseAdmin'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

// Get user from authorization header
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

// GET /api/bidding-portal/closing-date - Get bid submission closing date
// This endpoint is read-only but requires authentication for security
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the closing date from bid_opening_settings table
    // Using service role to ensure we can read the data
    const { data, error } = await (supabaseAdmin as any)
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
