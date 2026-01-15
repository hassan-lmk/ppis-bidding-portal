import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabase'
import { 
  encryptWorkUnits,
  getMasterKey
} from '../../../lib/work-units-encryption'

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

// GET /api/bid-applications/[id] - Get specific application
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

    const { data, error } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*, order: sort_order),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Error fetching bid application:', error)
      return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/bid-applications/[id]:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/bid-applications/[id] - Update application
export async function PATCH(
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

    // Get current application
    const { data: currentApp } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!currentApp) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (currentApp.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Cannot modify submitted application' 
      }, { status: 403 })
    }

    // Check deadline
    if (currentApp.deadline) {
      const deadline = new Date(currentApp.deadline)
      if (deadline < new Date()) {
        return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 403 })
      }
    }

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Step 1 fields
    if (body.primary_applicant_name !== undefined) {
      updateData.primary_applicant_name = body.primary_applicant_name
    }
    if (body.submission_type !== undefined) {
      updateData.submission_type = body.submission_type
    }

    // Step 2 payment fields
    if (body.payment_method !== undefined) {
      updateData.payment_method = body.payment_method
    }
    if (body.payment_transaction_id !== undefined) {
      updateData.payment_transaction_id = body.payment_transaction_id
    }
    if (body.payment_proof_url !== undefined) {
      updateData.payment_proof_url = body.payment_proof_url
    }
    if (body.bank_name !== undefined) {
      updateData.bank_name = body.bank_name
    }
    if (body.challan_number !== undefined) {
      updateData.challan_number = body.challan_number
    }
    if (body.challan_date !== undefined) {
      updateData.challan_date = body.challan_date
    }
    if (body.application_fee_status !== undefined) {
      updateData.application_fee_status = body.application_fee_status
      if (body.application_fee_status === 'paid') {
        updateData.payment_paid_at = new Date().toISOString()
      }
    }

    // Step 4: Work Unit field - Encrypt when saving
    if (body.work_units !== undefined) {
      const workUnitNum = Number(body.work_units)
      if (!isNaN(workUnitNum) && workUnitNum >= 100) {
        // Get master key from environment (persistent across database resets)
        const masterKey = getMasterKey()
        
        // Encrypt work units with the master key
        const encryptedWorkUnits = encryptWorkUnits(workUnitNum, masterKey)
        
        // Store encrypted work units (keep work_units as NULL until decryption)
        updateData.work_units = null // Keep as NULL until decrypted
        updateData.work_units_encrypted = encryptedWorkUnits
        updateData.work_units_encrypted_at = new Date().toISOString()
        
        console.log('✓ Work units encrypted with persistent master key')
      }
    }

    // Update application
    const { error: updateError } = await (supabaseAdmin as any)
      .from('bid_applications')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating bid application:', updateError)
      return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
    }

    // Handle consortium companies if provided
    if (body.consortium_companies !== undefined) {
      // Delete existing
      await (supabaseAdmin as any)
        .from('bid_consortium_companies')
        .delete()
        .eq('bid_application_id', id)

      // Insert new with percentages if provided
      if (currentApp.submission_type === 'consortium' && Array.isArray(body.consortium_companies) && body.consortium_companies.length > 0) {
        const percentages = body.consortium_percentages as Record<string, string> | undefined
        
        const companies = body.consortium_companies.map((name: string, index: number) => {
          // Get percentage for this company using company_X key
          let percentage = null
          if (percentages) {
            const companyKey = `company_${index}`
            const percentageValue = percentages[companyKey]
            if (percentageValue !== undefined && percentageValue !== '') {
              const percentageNum = Number(percentageValue)
              if (!isNaN(percentageNum) && percentageNum >= 0 && percentageNum <= 100) {
                percentage = percentageNum
              }
            }
          }
          
          return {
            bid_application_id: id,
            company_name: name,
            sort_order: index,
            work_unit_percentage: percentage
          }
        })

        const { error: insertError } = await (supabaseAdmin as any)
          .from('bid_consortium_companies')
          .insert(companies)

        if (insertError) {
          console.error('Error inserting consortium companies:', insertError)
        }
      }
    } else if (body.consortium_percentages !== undefined && typeof body.consortium_percentages === 'object' && currentApp.submission_type === 'consortium') {
      // Update percentages only (if companies already exist)
      const percentages = body.consortium_percentages as Record<string, string>
      
      // Get existing companies
      const { data: existingCompanies } = await (supabaseAdmin as any)
        .from('bid_consortium_companies')
        .select('id, sort_order')
        .eq('bid_application_id', id)
        .order('sort_order')
      
      if (existingCompanies) {
        for (let i = 0; i < existingCompanies.length; i++) {
          const companyKey = `company_${i}`
          const percentage = percentages[companyKey]
          if (percentage !== undefined && percentage !== '') {
            const percentageNum = Number(percentage)
            if (!isNaN(percentageNum) && percentageNum >= 0 && percentageNum <= 100) {
              const { error: updateError } = await (supabaseAdmin as any)
                .from('bid_consortium_companies')
                .update({ work_unit_percentage: percentageNum })
                .eq('id', existingCompanies[i].id)
                .eq('bid_application_id', id)

              if (updateError) {
                console.error(`Error updating work unit percentage for company ${existingCompanies[i].id}:`, updateError)
              }
            }
          }
        }
      }
    }

    // Return updated application
    const { data: updatedApp } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*, order: sort_order),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .eq('id', id)
      .single()

    return NextResponse.json(updatedApp)
  } catch (error) {
    console.error('Error in PATCH /api/bid-applications/[id]:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}





