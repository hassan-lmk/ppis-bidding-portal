import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerSupabaseClient } from '../_supabaseAdmin'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

// Get user and token from authorization header; returns { user, token } or { user: null, token: null }
async function getUserAndToken(request: NextRequest) {
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

// GET /api/bid-applications - Get all applications for current user
export async function GET(request: NextRequest) {
  try {
    const { user, token } = await getUserAndToken(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = createServerSupabaseClient(token)

    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('areaId')

    let query = supabaseUser
      .from('bid_applications')
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (areaId) {
      query = query.eq('area_id', areaId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching bid applications:', error)
      return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error in GET /api/bid-applications:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/bid-applications - Create new application
export async function POST(request: NextRequest) {
  try {
    const { user, token } = await getUserAndToken(request)

    if (!user || !token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUser = createServerSupabaseClient(token)

    const body = await request.json()
    const { area_id } = body

    if (!area_id) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 })
    }

    // Check if user has purchased this area (RLS sees user via token)
    const { data: purchase } = await supabaseUser
      .from('area_downloads')
      .select('id')
      .eq('user_id', user.id)
      .eq('area_id', area_id)
      .eq('payment_status', 'completed')
      .maybeSingle()

    if (!purchase) {
      return NextResponse.json({
        error: 'You must purchase the bidding document first'
      }, { status: 403 })
    }

    // Check if application already exists
    const { data: existing } = await supabaseUser
      .from('bid_applications')
      .select('*')
      .eq('user_id', user.id)
      .eq('area_id', area_id)
      .maybeSingle()

    if (existing) {
      // Always fetch full application with all relations
      const { data: fullApp } = await supabaseUser
        .from('bid_applications')
        .select(`
          *,
          consortium_companies:bid_consortium_companies(*),
          documents:bid_documents(*),
          area:areas(id, name, code, status, bid_submission_deadline)
        `)
        .eq('id', existing.id)
        .single()

      if (existing.status === 'submitted' || existing.status === 'under_review' || existing.status === 'approved') {
        return NextResponse.json({
          error: 'You have already submitted an application for this block',
          application: fullApp
        }, { status: 409 })
      }

      // Return existing draft
      return NextResponse.json(fullApp)
    }

    // Check area status (areas may be public read; use same client for consistency)
    const { data: area } = await supabaseUser
      .from('areas')
      .select('id, status, bid_submission_deadline')
      .eq('id', area_id)
      .maybeSingle()

    if (!area) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    if (area.status !== 'Open') {
      return NextResponse.json({ error: 'Bidding is not open for this block' }, { status: 403 })
    }

    // Check deadline
    if (area.bid_submission_deadline) {
      const deadline = new Date(area.bid_submission_deadline)
      if (deadline < new Date()) {
        return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 403 })
      }
    }

    // Create new application
    const { data: newApp, error: createError } = await supabaseUser
      .from('bid_applications')
      .insert({
        user_id: user.id,
        area_id: area_id,
        primary_applicant_name: '',
        submission_type: 'single',
        deadline: area.bid_submission_deadline || null
      })
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .single()

    if (createError) {
      console.error('Error creating bid application:', createError)
      return NextResponse.json({ error: 'Failed to create application' }, { status: 500 })
    }

    return NextResponse.json(newApp, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/bid-applications:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

