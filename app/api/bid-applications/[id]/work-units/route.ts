import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../_supabaseAdmin'
import { 
  encryptWorkUnits,
  getMasterKey,
  verifyEncryption
} from '../../../../lib/work-units-encryption'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

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

const MINIMUM_WORK_UNITS = 101 // Benchmark is 100, so minimum is 101

// POST /api/bid-applications/[id]/work-units - Submit work units
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { work_units } = body

    // Validate work units
    if (work_units === undefined || work_units === null) {
      return NextResponse.json({ error: 'Work units are required' }, { status: 400 })
    }

    const workUnitsNum = parseInt(work_units, 10)
    
    if (isNaN(workUnitsNum)) {
      return NextResponse.json({ error: 'Work units must be a number' }, { status: 400 })
    }

    if (workUnitsNum < MINIMUM_WORK_UNITS) {
      return NextResponse.json({ 
        error: `Work units must be at least ${MINIMUM_WORK_UNITS} (benchmark is 100)` 
      }, { status: 400 })
    }

    // Get application with area details
    const { data: app, error: appError } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        areas!inner(
          id,
          name,
          work_program_opens_at
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (appError || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // Check if application is submitted
    if (app.status !== 'submitted' && app.status !== 'under_review' && app.status !== 'approved') {
      return NextResponse.json({ 
        error: 'You must submit your bid application before entering work units' 
      }, { status: 400 })
    }

    // Check if work units already submitted
    if (app.work_units_status === 'submitted' || app.work_units_status === 'confirmed') {
      return NextResponse.json({ 
        error: 'Work units have already been submitted and cannot be changed' 
      }, { status: 400 })
    }

    // Check if work program is open
    // areas is an array from the join, but there should only be one area
    const area = Array.isArray(app.areas) ? app.areas[0] : app.areas
    const workProgramOpensAt = area?.work_program_opens_at
    if (!workProgramOpensAt) {
      return NextResponse.json({ 
        error: 'Work program submission is not yet scheduled for this block' 
      }, { status: 400 })
    }

    const opensAt = new Date(workProgramOpensAt)
    const now = new Date()

    if (now < opensAt) {
      return NextResponse.json({ 
        error: 'Work program submission is not open yet',
        opens_at: workProgramOpensAt
      }, { status: 400 })
    }

    let masterKey: Buffer
    let encryptedWorkUnits: string
    try {
      masterKey = getMasterKey()
      encryptedWorkUnits = encryptWorkUnits(workUnitsNum, masterKey)
    } catch (encErr) {
      console.error('Encryption service error:', encErr)
      return NextResponse.json(
        { error: 'Encryption service unavailable — please try again or contact support.' },
        { status: 503 }
      )
    }

    try {
      verifyEncryption(workUnitsNum, encryptedWorkUnits, masterKey)
    } catch (verifyErr) {
      console.error('Encryption verification failed:', verifyErr)
      return NextResponse.json(
        { error: 'Encryption integrity check failed — please try again.' },
        { status: 500 }
      )
    }

    const { data: updatedApp, error: updateError } = await (supabaseAdmin as any)
      .from('bid_applications')
      .update({
        work_units: null,
        work_units_encrypted: encryptedWorkUnits,
        work_units_encrypted_at: new Date().toISOString(),
        work_units_submitted_at: new Date().toISOString(),
        work_units_status: 'submitted',
        work_units_plaintext_backup: workUnitsNum,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating work units:', updateError)
      return NextResponse.json({ error: 'Failed to submit work units' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Work units submitted successfully',
      application: updatedApp
    })
  } catch (error) {
    console.error('Error in POST /api/bid-applications/[id]/work-units:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET /api/bid-applications/[id]/work-units - Get work unit status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const { data: app, error } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        id,
        work_units,
        work_units_submitted_at,
        work_units_status,
        status,
        areas!inner(
          id,
          name,
          work_program_opens_at
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    // areas is an array from the join, but there should only be one area
    const area = Array.isArray(app.areas) ? app.areas[0] : app.areas
    const workProgramOpensAt = area?.work_program_opens_at
    const now = new Date()
    const opensAt = workProgramOpensAt ? new Date(workProgramOpensAt) : null
    
    return NextResponse.json({
      work_units: app.work_units,
      work_units_submitted_at: app.work_units_submitted_at,
      work_units_status: app.work_units_status,
      application_status: app.status,
      work_program_opens_at: workProgramOpensAt,
      is_open: opensAt ? now >= opensAt : false,
      minimum_work_units: MINIMUM_WORK_UNITS
    })
  } catch (error) {
    console.error('Error in GET /api/bid-applications/[id]/work-units:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

