import { supabase } from './supabase'

// =====================================================
// Types for Bid Submission Module
// =====================================================

export interface BidApplication {
  id: string
  user_id: string
  area_id: string
  
  // Step 1: Profile & Consortium
  primary_applicant_name: string
  submission_type: 'single' | 'consortium'
  
  // Step 2: Payment
  application_fee_amount: number
  application_fee_status: 'pending' | 'paid' | 'verified' | 'failed'
  payment_method: 'online' | 'bank_challan' | null
  payment_transaction_id: string | null
  payment_proof_url: string | null
  bank_name: string | null
  challan_number: string | null
  challan_date: string | null
  payment_paid_at: string | null
  
  // Status
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
  rejection_reason: string | null
  
  // Timestamps
  submitted_at: string | null
  deadline: string | null
  created_at: string
  updated_at: string
}

export interface BidConsortiumCompany {
  id: string
  bid_application_id: string
  company_name: string
  sort_order: number
  created_at: string
}

export interface BidDocument {
  id: string
  bid_application_id: string
  document_type: string
  document_label: string | null
  consortium_company_id: string | null
  file_url: string
  file_name: string
  file_size: number | null
  file_type: string | null
  uploaded_at: string
  updated_at: string
}

export interface BidApplicationWithDetails extends BidApplication {
  consortium_companies: BidConsortiumCompany[]
  documents: BidDocument[]
  area?: {
    id: string
    name: string
    code: string
    status: string
    bid_submission_deadline: string | null
  }
}

// Document type definitions with labels
export const DOCUMENT_TYPES = {
  annexure_a: {
    key: 'annexure_a',
    label: 'Map of Block (Annexure A)',
    required: true,
    perCompany: false
  },
  annexure_b: {
    key: 'annexure_b',
    label: 'Application on the prescribed form (Annexure B)',
    required: true,
    perCompany: false
  },
  annexure_c: {
    key: 'annexure_c',
    label: 'Particulars to be furnished by applicants (Annexure C)',
    required: true,
    perCompany: true // Per consortium company
  },
  annexure_d: {
    key: 'annexure_d',
    label: 'Work Program (Annexure D)',
    required: true,
    perCompany: false
  },
  annexure_f: {
    key: 'annexure_f',
    label: 'Unconditional undertaking on prescribed form (Annexure F)',
    required: true,
    perCompany: false
  },
  annexure_g: {
    key: 'annexure_g',
    label: 'Annexure G',
    required: true,
    perCompany: false
  },
  annexure_h: {
    key: 'annexure_h',
    label: 'Annexure H',
    required: true,
    perCompany: false
  },
  annexure_i: {
    key: 'annexure_i',
    label: 'Pakistan Offshore Petroleum Rules, 2023 (Annexure I)',
    required: true,
    perCompany: false
  },
  annexure_j: {
    key: 'annexure_j',
    label: 'Pakistan Petroleum Policy 2012 (Annexure J)',
    required: true,
    perCompany: false
  },
  juridical_status: {
    key: 'juridical_status',
    label: 'Evidence of juridical status of the company',
    required: true,
    perCompany: false
  },
  articles_of_association: {
    key: 'articles_of_association',
    label: "Copy of company's statute and Articles of Association",
    required: true,
    perCompany: false
  },
  organizational_structure: {
    key: 'organizational_structure',
    label: "Description of company's organizational structure",
    required: true,
    perCompany: true // Per consortium company
  },
  operator_experience: {
    key: 'operator_experience',
    label: 'Experience as Operator',
    required: true,
    perCompany: false
  }
} as const

export type DocumentTypeKey = keyof typeof DOCUMENT_TYPES

// =====================================================
// API Functions
// =====================================================

/**
 * Check if user can apply for bidding on an area
 * Requirements: Area must have status "Open", user must have purchased the area
 */
export async function canApplyForBidding(areaId: string): Promise<{
  canApply: boolean
  reason?: string
  existingApplication?: BidApplication
}> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { canApply: false, reason: 'User not authenticated' }
  }

  // Check if user has purchased this area
  const { data: purchase } = await supabase
    .from('area_downloads')
    .select('id')
    .eq('user_id', user.id)
    .eq('area_id', areaId)
    .eq('payment_status', 'completed')
    .maybeSingle()

  if (!purchase) {
    return { canApply: false, reason: 'You must purchase the bidding document first' }
  }

  // Check area status
  const { data: area } = await supabase
    .from('areas')
    .select('id, status, bid_submission_deadline')
    .eq('id', areaId)
    .maybeSingle()

  if (!area) {
    return { canApply: false, reason: 'Area not found' }
  }

  if (area.status !== 'Open') {
    return { canApply: false, reason: 'Bidding is not open for this block' }
  }

  // Check deadline
  if (area.bid_submission_deadline) {
    const deadline = new Date(area.bid_submission_deadline)
    if (deadline < new Date()) {
      return { canApply: false, reason: 'Submission deadline has passed' }
    }
  }

  // Check if user already has an application for this area
  const { data: existingApp } = await supabase
    .from('bid_applications')
    .select('*')
    .eq('user_id', user.id)
    .eq('area_id', areaId)
    .maybeSingle()

  if (existingApp) {
    if (existingApp.status === 'submitted' || existingApp.status === 'under_review' || existingApp.status === 'approved') {
      return { 
        canApply: false, 
        reason: 'You have already submitted an application for this block',
        existingApplication: existingApp
      }
    }
    // Draft or rejected - can continue editing
    return { canApply: true, existingApplication: existingApp }
  }

  return { canApply: true }
}

/**
 * Create a new bid application or get existing draft
 */
export async function createOrGetBidApplication(areaId: string): Promise<BidApplicationWithDetails> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Check if application already exists
  const { data: existing } = await supabase
    .from('bid_applications')
    .select(`
      *,
      consortium_companies:bid_consortium_companies(*),
      documents:bid_documents(*)
    `)
    .eq('user_id', user.id)
    .eq('area_id', areaId)
    .maybeSingle()

  if (existing) {
    return existing as BidApplicationWithDetails
  }

  // Get area details for deadline
  const { data: area } = await supabase
    .from('areas')
    .select('bid_submission_deadline')
    .eq('id', areaId)
    .maybeSingle()

  // Create new application
  const { data: newApp, error } = await supabase
    .from('bid_applications')
    .insert({
      user_id: user.id,
      area_id: areaId,
      primary_applicant_name: '',
      submission_type: 'single',
      deadline: area?.bid_submission_deadline || null
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating bid application:', error)
    throw new Error('Failed to create bid application')
  }

  return {
    ...newApp,
    consortium_companies: [],
    documents: []
  } as BidApplicationWithDetails
}

/**
 * Get bid application by ID with all details
 */
export async function getBidApplication(applicationId: string): Promise<BidApplicationWithDetails | null> {
  const { data, error } = await supabase
    .from('bid_applications')
    .select(`
      *,
      consortium_companies:bid_consortium_companies(*, order: sort_order),
      documents:bid_documents(*),
      area:areas(id, name, code, status, bid_submission_deadline)
    `)
    .eq('id', applicationId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching bid application:', error)
    return null
  }

  return data as BidApplicationWithDetails
}

/**
 * Get all bid applications for current user
 */
export async function getUserBidApplications(): Promise<BidApplicationWithDetails[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('bid_applications')
    .select(`
      *,
      consortium_companies:bid_consortium_companies(*),
      documents:bid_documents(*),
      area:areas(id, name, code, status, bid_submission_deadline)
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user bid applications:', error)
    return []
  }

  return (data || []) as BidApplicationWithDetails[]
}

/**
 * Update bid application step 1 (Profile & Consortium)
 */
export async function updateBidApplicationStep1(
  applicationId: string,
  data: {
    primary_applicant_name: string
    submission_type: 'single' | 'consortium'
    consortium_companies?: string[]
  }
): Promise<BidApplicationWithDetails> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Update the application
  const { error: updateError } = await supabase
    .from('bid_applications')
    .update({
      primary_applicant_name: data.primary_applicant_name,
      submission_type: data.submission_type,
      updated_at: new Date().toISOString()
    })
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .eq('status', 'draft')

  if (updateError) {
    console.error('Error updating bid application:', updateError)
    throw new Error('Failed to update application')
  }

  // Handle consortium companies
  if (data.submission_type === 'consortium' && data.consortium_companies) {
    // Delete existing consortium companies
    await supabase
      .from('bid_consortium_companies')
      .delete()
      .eq('bid_application_id', applicationId)

    // Insert new consortium companies
    if (data.consortium_companies.length > 0) {
      const companies = data.consortium_companies.map((name, index) => ({
        bid_application_id: applicationId,
        company_name: name,
        sort_order: index
      }))

      const { error: insertError } = await supabase
        .from('bid_consortium_companies')
        .insert(companies)

      if (insertError) {
        console.error('Error inserting consortium companies:', insertError)
        throw new Error('Failed to save consortium companies')
      }
    }
  } else if (data.submission_type === 'single') {
    // Remove all consortium companies for single submission
    await supabase
      .from('bid_consortium_companies')
      .delete()
      .eq('bid_application_id', applicationId)
  }

  // Return updated application
  const result = await getBidApplication(applicationId)
  if (!result) {
    throw new Error('Failed to retrieve updated application')
  }
  
  return result
}

/**
 * Update bid application step 2 (Payment)
 */
export async function updateBidApplicationPayment(
  applicationId: string,
  data: {
    payment_method: 'online' | 'bank_challan'
    payment_transaction_id?: string
    payment_proof_url?: string
    bank_name?: string
    challan_number?: string
    challan_date?: string
  }
): Promise<BidApplicationWithDetails> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  const updateData: Record<string, any> = {
    payment_method: data.payment_method,
    updated_at: new Date().toISOString()
  }

  if (data.payment_method === 'online' && data.payment_transaction_id) {
    updateData.payment_transaction_id = data.payment_transaction_id
    updateData.application_fee_status = 'paid'
    updateData.payment_paid_at = new Date().toISOString()
  } else if (data.payment_method === 'bank_challan') {
    updateData.payment_proof_url = data.payment_proof_url
    updateData.bank_name = data.bank_name
    updateData.challan_number = data.challan_number
    updateData.challan_date = data.challan_date
    updateData.application_fee_status = 'paid'
    updateData.payment_paid_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('bid_applications')
    .update(updateData)
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .eq('status', 'draft')

  if (error) {
    console.error('Error updating payment:', error)
    throw new Error('Failed to update payment information')
  }

  const result = await getBidApplication(applicationId)
  if (!result) {
    throw new Error('Failed to retrieve updated application')
  }
  
  return result
}

/**
 * Add or update a document
 */
export async function uploadBidDocument(
  applicationId: string,
  documentType: DocumentTypeKey,
  file: File,
  consortiumCompanyId?: string
): Promise<BidDocument> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Generate unique filename
  const timestamp = Date.now()
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const fileName = `${timestamp}_${sanitizedName}`
  const filePath = `${user.id}/${applicationId}/${documentType}${consortiumCompanyId ? `_${consortiumCompanyId}` : ''}/${fileName}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('bid-submissions')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type
    })

  if (uploadError) {
    console.error('Error uploading file:', uploadError)
    throw new Error('Failed to upload file')
  }

  // Get the file URL
  const { data: urlData } = supabase.storage
    .from('bid-submissions')
    .getPublicUrl(filePath)

  // Delete existing document of same type for this company (if replacing)
  await supabase
    .from('bid_documents')
    .delete()
    .eq('bid_application_id', applicationId)
    .eq('document_type', documentType)
    .eq('consortium_company_id', consortiumCompanyId || null)

  // Insert document record
  const docTypeInfo = DOCUMENT_TYPES[documentType]
  const { data: docData, error: insertError } = await supabase
    .from('bid_documents')
    .insert({
      bid_application_id: applicationId,
      document_type: documentType,
      document_label: docTypeInfo.label,
      consortium_company_id: consortiumCompanyId || null,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error inserting document record:', insertError)
    throw new Error('Failed to save document record')
  }

  return docData as BidDocument
}

/**
 * Delete a document
 */
export async function deleteBidDocument(documentId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get document to find file path
  const { data: doc } = await supabase
    .from('bid_documents')
    .select('file_url, bid_application_id')
    .eq('id', documentId)
    .maybeSingle()

  if (!doc) {
    throw new Error('Document not found')
  }

  // Delete from storage
  try {
    const url = new URL(doc.file_url)
    const pathParts = url.pathname.split('/storage/v1/object/public/bid-submissions/')
    if (pathParts[1]) {
      await supabase.storage
        .from('bid-submissions')
        .remove([pathParts[1]])
    }
  } catch (e) {
    console.error('Error deleting file from storage:', e)
  }

  // Delete record
  const { error } = await supabase
    .from('bid_documents')
    .delete()
    .eq('id', documentId)

  if (error) {
    console.error('Error deleting document:', error)
    throw new Error('Failed to delete document')
  }
}

/**
 * Submit the bid application (final submission)
 */
export async function submitBidApplication(applicationId: string): Promise<BidApplicationWithDetails> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get application with details
  const app = await getBidApplication(applicationId)
  if (!app) {
    throw new Error('Application not found')
  }

  // Validate application is ready for submission
  const validation = validateBidApplication(app)
  if (!validation.isValid) {
    throw new Error(validation.errors.join(', '))
  }

  // Check deadline
  if (app.deadline) {
    const deadline = new Date(app.deadline)
    if (deadline < new Date()) {
      throw new Error('Submission deadline has passed')
    }
  }

  // Update status to submitted
  const { error } = await supabase
    .from('bid_applications')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', applicationId)
    .eq('user_id', user.id)
    .eq('status', 'draft')

  if (error) {
    console.error('Error submitting application:', error)
    throw new Error('Failed to submit application')
  }

  const result = await getBidApplication(applicationId)
  if (!result) {
    throw new Error('Failed to retrieve submitted application')
  }
  
  return result
}

/**
 * Validate if application is ready for submission
 */
export function validateBidApplication(app: BidApplicationWithDetails): {
  isValid: boolean
  errors: string[]
  missingDocuments: string[]
} {
  const errors: string[] = []
  const missingDocuments: string[] = []

  // Step 1 validation
  if (!app.primary_applicant_name) {
    errors.push('Primary applicant name is required')
  }

  if (app.submission_type === 'consortium') {
    if (!app.consortium_companies || app.consortium_companies.length === 0) {
      errors.push('At least one consortium company is required')
    }
  }

  // Step 2 validation
  if (app.application_fee_status !== 'paid' && app.application_fee_status !== 'verified') {
    errors.push('Application fee must be paid')
  }

  // Step 3 validation - Check required documents
  const uploadedDocTypes = new Set(
    app.documents.map(d => {
      if (d.consortium_company_id) {
        return `${d.document_type}_${d.consortium_company_id}`
      }
      return d.document_type
    })
  )

  Object.values(DOCUMENT_TYPES).forEach(docType => {
    if (!docType.required) return

    if (docType.perCompany) {
      if (app.submission_type === 'consortium') {
        // Check if each consortium company has this document
        app.consortium_companies.forEach(company => {
          const key = `${docType.key}_${company.id}`
          if (!uploadedDocTypes.has(key)) {
            missingDocuments.push(`${docType.label} for ${company.company_name}`)
          }
        })
      } else {
        // Single company submission - check if document exists (without consortium_company_id)
        if (!uploadedDocTypes.has(docType.key)) {
          missingDocuments.push(docType.label)
        }
      }
    } else {
      // Regular document (not per company)
      if (!uploadedDocTypes.has(docType.key)) {
        missingDocuments.push(docType.label)
      }
    }
  })

  if (missingDocuments.length > 0) {
    errors.push(`Missing required documents: ${missingDocuments.slice(0, 3).join(', ')}${missingDocuments.length > 3 ? ` and ${missingDocuments.length - 3} more` : ''}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingDocuments
  }
}

/**
 * Get document upload progress
 */
export function getDocumentProgress(app: BidApplicationWithDetails): {
  uploaded: number
  required: number
  percentage: number
} {
  let required = 0
  let uploaded = 0

  Object.values(DOCUMENT_TYPES).forEach(docType => {
    if (!docType.required) return

    if (docType.perCompany && app.submission_type === 'consortium') {
      const companyCount = Math.max(app.consortium_companies.length, 1)
      required += companyCount
      
      app.consortium_companies.forEach(company => {
        if (app.documents.some(d => 
          d.document_type === docType.key && 
          d.consortium_company_id === company.id
        )) {
          uploaded++
        }
      })
    } else {
      required++
      if (app.documents.some(d => d.document_type === docType.key && !d.consortium_company_id)) {
        uploaded++
      }
    }
  })

  return {
    uploaded,
    required,
    percentage: required > 0 ? Math.round((uploaded / required) * 100) : 0
  }
}

