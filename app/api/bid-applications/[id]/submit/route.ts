import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../_supabaseAdmin'
import { sendEmail, getBidApplicationSubmissionTemplate } from '../../../../lib/email'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

// Document types with validation rules
type DocumentType = {
  label: string
  required: boolean
  perCompany: boolean
  multipleFiles?: boolean
  maxFiles?: number
}

const DOCUMENT_TYPES: Record<string, DocumentType> = {
  annexure_a: { label: 'Map of Block (Annexure A)', required: true, perCompany: false },
  annexure_b: { label: 'Application on prescribed form (Annexure B)', required: true, perCompany: false },
  annexure_c: { label: 'Particulars by applicants (Annexure C)', required: true, perCompany: true },
  annexure_d: { label: 'Work Program (Annexure D)', required: true, perCompany: false },
  annexure_f: { label: 'Unconditional undertaking (Annexure F)', required: true, perCompany: false },
  annexure_i: { label: 'Pakistan Offshore Petroleum Rules (Annexure I)', required: true, perCompany: false },
  annexure_j: { label: 'Pakistan Petroleum Policy 2012 (Annexure J)', required: true, perCompany: false },
  juridical_status: { label: 'Evidence of juridical status', required: true, perCompany: false },
  articles_of_association: { label: 'Articles of Association', required: true, perCompany: false },
  organizational_structure: { label: 'Organizational structure', required: true, perCompany: true },
  operator_experience: { label: 'Experience as Operator', required: true, perCompany: false },
  financial_report: { label: 'Financial Report of last 5 years', required: true, perCompany: true, multipleFiles: true, maxFiles: 5 }
}

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

// POST /api/bid-applications/[id]/submit - Submit application
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

    // Get full application with details
    const { data: app, error: fetchError } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (fetchError || !app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (app.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Application has already been submitted' 
      }, { status: 400 })
    }

    // Check deadline from application
    if (app.deadline) {
      const deadline = new Date(app.deadline)
      if (deadline < new Date()) {
        return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 403 })
      }
    }

    // Check bid submission closing date from bid_opening_settings
    const { data: settings, error: settingsError } = await (supabaseAdmin as any)
      .from('bid_opening_settings')
      .select('bid_submission_closing_date')
      .maybeSingle()

    if (!settingsError && settings?.bid_submission_closing_date) {
      const closingDate = new Date(settings.bid_submission_closing_date)
      if (closingDate < new Date()) {
        return NextResponse.json({ 
          error: 'Bid submission deadline has passed. No further submissions are accepted.' 
        }, { status: 403 })
      }
    }

    // Validate application
    const errors: string[] = []
    const missingDocuments: string[] = []

    // Step 1 validation
    if (!app.primary_applicant_name || app.primary_applicant_name.trim() === '') {
      errors.push('Primary applicant name is required')
    }

    if (app.submission_type === 'consortium') {
      if (!app.consortium_companies || app.consortium_companies.length === 0) {
        errors.push('At least one consortium company is required for consortium submission')
      }
    }

    // Step 2 validation
    if (app.application_fee_status !== 'paid' && app.application_fee_status !== 'verified') {
      errors.push('Application fee must be paid')
    }

    // Step 3 validation - Check required documents
    const uploadedDocTypes = new Map<string, number>() // Changed to count for multiple files
    
    for (const doc of app.documents || []) {
      // Normalize financial_report_X to financial_report for counting
      const normalizedType = doc.document_type?.startsWith('financial_report_') 
        ? 'financial_report' 
        : doc.document_type
      
      if (doc.consortium_company_id) {
        const docKey = `${normalizedType}_${doc.consortium_company_id}`
        uploadedDocTypes.set(docKey, (uploadedDocTypes.get(docKey) || 0) + 1)
      } else {
        uploadedDocTypes.set(normalizedType, (uploadedDocTypes.get(normalizedType) || 0) + 1)
      }
    }

    Object.entries(DOCUMENT_TYPES).forEach(([key, docType]) => {
      if (!docType.required) return

      if (docType.perCompany) {
        if (app.submission_type === 'consortium') {
          // Check each consortium company has this document
          for (const company of app.consortium_companies || []) {
            const docKey = `${key}_${company.id}`
            
            // For per-company documents with multiple files (like financial reports)
            if (docType.multipleFiles) {
              const requiredCount = docType.maxFiles || 5
              const uploadedCount = uploadedDocTypes.get(docKey) || 0
              if (uploadedCount < requiredCount) {
                missingDocuments.push(`${docType.label} for ${company.company_name} (${uploadedCount}/${requiredCount} files)`)
              }
            } else {
              // Single file per company
              if (!uploadedDocTypes.has(docKey) || uploadedDocTypes.get(docKey)! === 0) {
                missingDocuments.push(`${docType.label} for ${company.company_name}`)
              }
            }
          }
        } else {
          // Single company mode
          if (docType.multipleFiles) {
            // Multiple files needed for single company
            const requiredCount = docType.maxFiles || 5
            const uploadedCount = uploadedDocTypes.get(key) || 0
            if (uploadedCount < requiredCount) {
              missingDocuments.push(`${docType.label} (${uploadedCount}/${requiredCount} files uploaded - all ${requiredCount} required)`)
            }
          } else {
            // Single file needed
            if (!uploadedDocTypes.has(key) || uploadedDocTypes.get(key)! === 0) {
              missingDocuments.push(docType.label)
            }
          }
        }
      } else if (docType.multipleFiles) {
        // For multiple file types without per-company
        const requiredCount = docType.maxFiles || 5
        const uploadedCount = uploadedDocTypes.get(key) || 0
        if (uploadedCount < requiredCount) {
          missingDocuments.push(`${docType.label} (${uploadedCount}/${requiredCount} files uploaded - all ${requiredCount} required)`)
        }
      } else {
        // Regular document
        if (!uploadedDocTypes.has(key) || uploadedDocTypes.get(key)! === 0) {
          missingDocuments.push(docType.label)
        }
      }
    })

    // Step 4 validation - Work Unit
    // Check if work units are encrypted (work_units_encrypted_at indicates encrypted work units exist)
    // When encrypted, work_units is NULL and the value is in work_units_encrypted
    if (!app.work_units_encrypted_at && (!app.work_units || app.work_units === null)) {
      errors.push('Work unit is required')
    } else if (app.work_units && !app.work_units_encrypted_at) {
      // Only validate numeric value if work units are not encrypted
      const workUnitNum = Number(app.work_units)
      if (isNaN(workUnitNum) || workUnitNum < 101) {
        errors.push('Work unit must be a number of 101 or above')
      }
    }
    // If work_units_encrypted_at exists, work units are encrypted and validation is not needed
    // (encrypted values are validated when they were originally submitted)

    // Step 4 validation - Consortium Work Unit Percentages
    if (app.submission_type === 'consortium' && app.consortium_companies && app.consortium_companies.length > 0) {
      const totalPercentage = app.consortium_companies.reduce((sum: number, company: any) => {
        return sum + (Number(company.work_unit_percentage) || 0)
      }, 0)
      
      if (Math.abs(totalPercentage - 100) > 0.01) {
        errors.push(`Total work unit percentage for JV partners must equal 100%. Current total: ${totalPercentage.toFixed(2)}%`)
      }
      
      // Check if all companies have percentages
      const missingPercentages = app.consortium_companies.filter((company: any) => 
        !company.work_unit_percentage && company.work_unit_percentage !== 0
      )
      if (missingPercentages.length > 0) {
        errors.push('Please enter work unit percentage for all JV partners')
      }
    }

    if (missingDocuments.length > 0) {
      const displayMissing = missingDocuments.slice(0, 5)
      const moreCount = missingDocuments.length - 5
      let errorMsg = `Missing required documents: ${displayMissing.join(', ')}`
      if (moreCount > 0) {
        errorMsg += ` and ${moreCount} more`
      }
      errors.push(errorMsg)
    }

    if (errors.length > 0) {
      return NextResponse.json({ 
        error: 'Validation failed',
        errors,
        missingDocuments
      }, { status: 400 })
    }

    // Update status to submitted
    const { error: updateError } = await (supabaseAdmin as any)
      .from('bid_applications')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error submitting application:', updateError)
      return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
    }

    // Return updated application
    const { data: submittedApp } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select(`
        *,
        consortium_companies:bid_consortium_companies(*),
        documents:bid_documents(*),
        area:areas(id, name, code, status, bid_submission_deadline)
      `)
      .eq('id', id)
      .single()

    // Send confirmation email to user
    try {
      if (user.email && submittedApp) {
        const emailTemplate = getBidApplicationSubmissionTemplate(
          submittedApp.primary_applicant_name || user.email.split('@')[0],
          submittedApp.id,
          submittedApp.area?.name || 'N/A',
          submittedApp.area?.code || '',
          submittedApp.submission_type || 'single',
          submittedApp.submitted_at || new Date().toISOString()
        )
        
        await sendEmail({
          to: user.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
          text: emailTemplate.text
        })
        
        console.log(`Confirmation email sent to ${user.email} for application ${submittedApp.id}`)
      } else {
        console.warn('Could not send confirmation email: user email or application data missing')
      }
    } catch (emailError) {
      // Log error but don't fail the submission
      console.error('Error sending confirmation email:', emailError)
    }

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully',
      application: submittedApp
    })
  } catch (error) {
    console.error('Error in POST /api/bid-applications/[id]/submit:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}





