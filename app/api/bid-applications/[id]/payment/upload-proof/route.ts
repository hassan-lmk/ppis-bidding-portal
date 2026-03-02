import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, createServerSupabaseClient } from '../../../../_supabaseAdmin'

// Force dynamic to avoid build-time initialization issues
export const dynamic = 'force-dynamic'

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

// POST /api/bid-applications/[id]/payment/upload-proof - Upload bank challan proof
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

    // Get application (RLS sees user via token)
    const { data: app } = await supabaseUser
      .from('bid_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!app) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 })
    }

    if (app.status !== 'draft') {
      return NextResponse.json({ 
        error: 'Cannot upload payment proof for submitted application' 
      }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // Validate file type (allow images and PDFs)
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png'
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Only PDF and image files (JPG, PNG) are allowed' 
      }, { status: 400 })
    }

    // Validate file size (10MB max for payment proof)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ 
        error: 'File size must be less than 10MB' 
      }, { status: 400 })
    }

    // Get company name from application or user profile
    let companyName = app.primary_applicant_name || ''
    
    // If no company name in application, try to get from user profile
    if (!companyName) {
      const { data: profile } = await supabaseUser
        .from('user_profiles')
        .select('company_name')
        .eq('id', user.id)
        .maybeSingle()

      companyName = profile?.company_name || 'Company'
    }
    
    // Sanitize company name for folder name (remove special chars, limit length)
    const sanitizedCompanyName = companyName
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 50) // Limit to 50 characters
      .toLowerCase()
    
    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'pdf'
    const fileName = `payment_proof_${timestamp}.${extension}`
    const folderName = `${sanitizedCompanyName}_${user.id}`
    const filePath = `${folderName}/${id}/payment/${fileName}`

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage (user-scoped client for RLS on storage if applicable)
    const { error: uploadError } = await supabaseUser.storage
      .from('bid-submissions')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type
      })

    if (uploadError) {
      console.error('Error uploading payment proof:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabaseUser.storage
      .from('bid-submissions')
      .getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      file_url: urlData.publicUrl,
      file_name: file.name
    })
  } catch (error) {
    console.error('Error in POST /api/bid-applications/[id]/payment/upload-proof:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

