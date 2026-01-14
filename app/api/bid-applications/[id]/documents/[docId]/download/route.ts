import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../_supabaseAdmin'

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

async function isBidReviewer(userId: string): Promise<boolean> {
  const { data: profile } = await (supabaseAdmin as any)
    .from('user_profiles')
    .select('user_type')
    .eq('id', userId)
    .single()

  return profile?.user_type === 'bid_reviewer'
}

// GET /api/bid-applications/[id]/documents/[docId]/download - Download document (for bid reviewers)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const user = await getUserFromRequest(request)
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is bid reviewer
    const reviewer = await isBidReviewer(user.id)
    if (!reviewer) {
      return NextResponse.json({ error: 'Bid Reviewer access required' }, { status: 403 })
    }

    const { id, docId } = await params

    // Get document
    const { data: document, error: docError } = await (supabaseAdmin as any)
      .from('bid_documents')
      .select('*, bid_applications!inner(id)')
      .eq('id', docId)
      .eq('bid_applications.id', id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get file from storage
    const fileUrl = (document as { file_url: string }).file_url
    
    // Extract bucket and path from URL
    let filePath = ''
    let bucket = 'bid-submissions' // Default bucket
    
    if (fileUrl.includes('/storage/v1/object/public/')) {
      // Extract path from public URL
      const parts = fileUrl.split('/storage/v1/object/public/')
      if (parts.length > 1) {
        const pathParts = parts[1].split('/')
        bucket = pathParts[0]
        filePath = pathParts.slice(1).join('/')
      }
    } else if (fileUrl.includes('/storage/v1/object/sign/')) {
      // Extract from signed URL
      const parts = fileUrl.split('/storage/v1/object/sign/')
      if (parts.length > 1) {
        const pathParts = parts[1].split('/')
        bucket = pathParts[0]
        filePath = pathParts.slice(1).join('/').split('?')[0] // Remove query params
      }
    } else if (fileUrl.includes('bid-submissions/')) {
      // Direct path reference
      filePath = fileUrl.includes('bid-submissions/') 
        ? fileUrl.split('bid-submissions/')[1]
        : fileUrl
    } else {
      // Assume it's a relative path (user_id/app_id/type/filename format)
      filePath = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl
    }

    if (!filePath) {
      return NextResponse.json({ error: 'Invalid file URL' }, { status: 400 })
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await (supabaseAdmin as any)
      .storage
      .from(bucket)
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError)
      return NextResponse.json({ 
        error: 'Failed to download file',
        details: downloadError?.message 
      }, { status: 500 })
    }

    // Convert blob to array buffer
    const arrayBuffer = await fileData.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Return file with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': document.file_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${document.file_name || 'document'}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('Error in document download:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 })
  }
}
