import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../_supabaseAdmin'

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

// POST /api/bid-applications/[id]/documents - Upload document
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

    // Get application
    const { data: app } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    const appData = app as { status: string; deadline?: string }

    if (appData.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Cannot upload documents to submitted application' 
      }, { status: 403 })
    }

    // Check deadline
    if (appData.deadline) {
      const deadline = new Date(appData.deadline)
      if (deadline < new Date()) {
        return NextResponse.json({ error: 'Submission deadline has passed' }, { status: 403 })
      }
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const documentType = formData.get('document_type') as string
    const documentLabel = formData.get('document_label') as string | null
    const consortiumCompanyId = formData.get('consortium_company_id') as string | null

    if (!file || !documentType) {
      return NextResponse.json({ 
        error: 'file and document_type are required' 
      }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Only PDF and Word documents are allowed' 
      }, { status: 400 })
    }

    // Validate file size (100MB max)
    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size must be less than 100MB' 
      }, { status: 400 })
    }

    // Get company name from application or user profile
    let companyName = (app as any).primary_applicant_name || ''
    
    // If no company name in application, try to get from user profile
    if (!companyName) {
      const { data: profile } = await (supabaseAdmin as any)
        .from('user_profiles')
        .select('company_name')
        .eq('id', user.id)
        .maybeSingle()
      
      companyName = (profile as any)?.company_name || 'Company'
    }
    
    // Sanitize company name for folder name (remove special chars, limit length)
    const sanitizedCompanyName = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50) // Limit to 50 characters
      .toLowerCase()
    
    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}_${sanitizedName}`
    const companyFolder = consortiumCompanyId ? `_${consortiumCompanyId}` : ''
    const folderName = `${sanitizedCompanyName}_${user.id}`
    const filePath = `${folderName}/${id}/${documentType}${companyFolder}/${fileName}`

    // Convert to buffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { error: uploadError } = await (supabaseAdmin as any).storage
      .from('bid-submissions')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get the file URL
    const { data: urlData } = (supabaseAdmin as any).storage
      .from('bid-submissions')
      .getPublicUrl(filePath)

    // Check if this document type allows multiple files
    // Financial report allows 5 files (stored as financial_report_1, financial_report_2, etc.)
    // So we should NOT delete existing ones
    const isFinancialReport = documentType.startsWith('financial_report')
    const multipleFilesTypes = ['financial_report'] // Base types that allow multiple files
    const allowsMultipleFiles = multipleFilesTypes.some(baseType => documentType.startsWith(baseType)) || isFinancialReport

    // Only delete existing documents if this is NOT a multiple file type
    // For multiple file types, we want to keep all existing files and add the new one
    if (!allowsMultipleFiles) {
      // Delete existing document of same type for this company (if replacing)
      const deleteQuery = (supabaseAdmin as any)
        .from('bid_documents')
        .delete()
        .eq('bid_application_id', id)
        .eq('document_type', documentType)

      if (consortiumCompanyId) {
        await deleteQuery.eq('consortium_company_id', consortiumCompanyId)
      } else {
        await deleteQuery.is('consortium_company_id', null)
      }
    }

    // Insert document record
    const { data: docData, error: insertError } = await (supabaseAdmin as any)
      .from('bid_documents')
      .insert({
        bid_application_id: id,
        document_type: documentType,
        document_label: documentLabel,
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
      return NextResponse.json({ error: 'Failed to save document record' }, { status: 500 })
    }

    return NextResponse.json(docData, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/bid-applications/[id]/documents:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE /api/bid-applications/[id]/documents?documentId=xxx - Delete document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get('documentId')

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    // Get application
    const { data: app } = await (supabaseAdmin as any)
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if ((app as any).status !== 'draft') {
      return NextResponse.json({ 
        error: 'Cannot delete documents from submitted application' 
      }, { status: 403 })
    }

    // Get document
    const { data: doc } = await (supabaseAdmin as any)
      .from('bid_documents')
      .select('*')
      .eq('id', documentId)
      .eq('bid_application_id', id)
      .maybeSingle()

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete from storage
    try {
      const url = new URL((doc as any).file_url)
      const pathParts = url.pathname.split('/storage/v1/object/public/bid-submissions/')
      if (pathParts[1]) {
        await (supabaseAdmin as any).storage
          .from('bid-submissions')
          .remove([decodeURIComponent(pathParts[1])])
      }
    } catch (e) {
      console.error('Error deleting file from storage:', e)
    }

    // Delete record
    const { error: deleteError } = await (supabaseAdmin as any)
      .from('bid_documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      console.error('Error deleting document:', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/bid-applications/[id]/documents:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

