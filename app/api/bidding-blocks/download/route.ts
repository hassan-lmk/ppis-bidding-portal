import { NextRequest, NextResponse } from 'next/server'

// Helper function to log downloads (non-blocking). Uses user's token when provided so RLS allows the insert.
function logDownload(
  areaId: string,
  userId: string | null,
  areaName: string,
  resourceType: string = 'bidding-blocks',
  accessToken?: string | null
) {
  setImmediate(async () => {
    try {
      const client = accessToken
        ? (await import('../../_supabaseAdmin')).createServerSupabaseClient(accessToken)
        : (await import('../../../lib/supabase')).supabaseAdmin
      const { error: logError } = await (client as any)
        .from('document_downloads')
        .insert({
          document_id: areaId,
          user_id: userId,
          resource_type: resourceType,
          downloaded: new Date().toISOString()
        })

      if (logError) {
        console.error('Error logging download:', logError)
        if (logError.code === 'PGRST204') {
          console.warn('document_downloads table not found. Please run the extend_document_downloads_table.sql script in Supabase Studio.')
        }
      } else {
        console.log(`Download logged for ${resourceType}: user ${userId || 'public'}, area ${areaName} (${areaId})`)
      }
    } catch (logErr: any) {
      if (logErr?.message && !logErr.message.includes('SSL') && !logErr.message.includes('tlsv1')) {
        console.error('Unexpected error logging download:', logErr)
      }
    }
  })
}

// Helper function to create file response
function getFileExtension(input?: string | null): string | null {
  if (!input) return null
  // Drop querystring/hash and get last path segment
  const noQuery = input.split('?')[0].split('#')[0]
  const lastSegment = noQuery.split('/').filter(Boolean).pop() || ''
  const match = lastSegment.match(/\.([a-zA-Z0-9]{1,10})$/)
  if (!match) return null
  return match[1].toLowerCase()
}

function getMimeTypeFromExtension(ext: string | null): string {
  switch (ext) {
    case 'pdf':
      return 'application/pdf'
    case 'zip':
      return 'application/zip'
    case 'rar':
      return 'application/vnd.rar'
    case '7z':
      return 'application/x-7z-compressed'
    case 'tar':
      return 'application/x-tar'
    case 'gz':
      return 'application/gzip'
    case 'doc':
      return 'application/msword'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

// Helper function to create file response
function createFileResponse(buffer: Buffer, downloadName: string) {
  const ext = getFileExtension(downloadName)
  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': getMimeTypeFromExtension(ext),
      'Content-Disposition': `attachment; filename="${downloadName}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  })
}

function getTokenFromRequest(request: NextRequest): string | null {
  // Prefer Authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '')
  }

  // Fallback to Supabase cookie (sb-access-token) if present
  const cookieToken = request.cookies.get('sb-access-token')?.value
  if (cookieToken) {
    return cookieToken
  }

  return null
}

// Build a safe download filename (preserve original extension)
function getDownloadName(areaName: string, targetUrlOrPath?: string | null, dbFileName?: string | null): string {
  const safeBase = areaName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document'
  const ext = getFileExtension(targetUrlOrPath) || getFileExtension(dbFileName) || 'pdf'
  // Avoid double extensions if the areaName already includes one.
  const safeBaseNoExt = safeBase.replace(new RegExp(`\\.${ext}$`, 'i'), '')
  return `${safeBaseNoExt}.${ext}`
}

async function fetchSignedUrlFile(signedUrl: string): Promise<Buffer> {
  // Use custom HTTPS agent to support self-hosted/TLS configs (mirrors supabase-https)
  const { httpsAgent } = await import('../../../lib/security')
  const isHttps = signedUrl.startsWith('https:')

  // Fallback agent that skips verification if ALLOW_INSECURE_TLS=true
  const allowInsecure = process.env.ALLOW_INSECURE_TLS === 'true'
  const insecureAgent = allowInsecure ? new (await import('https')).Agent({ rejectUnauthorized: false }) : undefined

  const response = await fetch(signedUrl, {
    // @ts-ignore - agent is valid for Node.js fetch
    agent: isHttps ? (allowInsecure ? insecureAgent : httpsAgent) : undefined,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to fetch signed URL: ${response.status} ${text}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const areaId = searchParams.get('areaId')
    const pdfUrl = searchParams.get('pdfUrl') // Optional: specific PDF URL from pdf_url jsonb array

    if (!areaId) {
      return NextResponse.json({ error: 'Missing areaId parameter' }, { status: 400 })
    }

    // Get the authorization token (header or cookie)
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 })
    }

    // Import Supabase: anon client for auth, user-scoped client for data (RLS with user JWT, no service role)
    const { supabaseAdmin: anonClient } = await import('../../../lib/supabase')
    const { createServerSupabaseClient } = await import('../../_supabaseAdmin')

    // Verify the user with the token (anon key)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      console.error('Authentication error (GET download):', authError)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userSupabase = createServerSupabaseClient(token)

    // Get the area details (user-scoped client, respects RLS)
    const { data: areaRaw, error: areaError } = await userSupabase
      .from('areas')
      .select('id, name, pdf_url, pdf_filename')
      .eq('id', areaId)
      .single()

    if (areaError || !areaRaw) {
      console.error('Error fetching area:', areaError)
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    const area = areaRaw as { id: string; name: string; pdf_url: any; pdf_filename: string | null }

    // Determine which PDF to use
    // Note: pdf_url array contains bid documents (require purchase)
    // Brochures use separate brochure_url field and are accessed via direct public links
    let targetPdfUrl: string | null = null
    
    if (pdfUrl) {
      // Use the specific PDF URL provided
      targetPdfUrl = pdfUrl
    } else if (area.pdf_url) {
      // pdf_url is now a jsonb array
      if (Array.isArray(area.pdf_url) && area.pdf_url.length > 0) {
        // Use first PDF from array
        targetPdfUrl = area.pdf_url[0]
      } else if (typeof area.pdf_url === 'string') {
        // Legacy single string format (shouldn't happen after migration)
        targetPdfUrl = area.pdf_url
      }
    }

    if (!targetPdfUrl) {
      return NextResponse.json({ error: 'No PDF document available for this area' }, { status: 404 })
    }

    // Verify purchase with user-scoped client; .maybeSingle() avoids PGRST116 when 0 rows
    const { data: downloadRecord, error: downloadError } = await userSupabase
      .from('area_downloads')
      .select('id, payment_status')
      .eq('user_id', user.id)
      .eq('area_id', areaId)
      .eq('payment_status', 'completed')
      .maybeSingle()

    if (downloadError || !downloadRecord) {
      if (downloadError) console.error('Download verification error:', downloadError)
      return NextResponse.json({
        error: 'You must purchase this area before downloading the document'
      }, { status: 403 })
    }

    // Normalize path for bidding-blocks bucket (bid documents are always in bidding-blocks)
    const resolvePath = (): { path: string | null, bucket: string } => {
      let path = ''
      const bucket = 'bidding-blocks' // Bid documents are always in bidding-blocks bucket
      
      if (targetPdfUrl) {
        // Check if it's from bidding-blocks bucket
        if (targetPdfUrl.includes('/storage/v1/object/public/bidding-blocks/')) {
          const parts = targetPdfUrl.split('/storage/v1/object/public/bidding-blocks/')
          if (parts.length > 1) path = parts[1]
        } else if (targetPdfUrl.includes('/storage/v1/object/sign/bidding-blocks/')) {
          // Signed URL
          const parts = targetPdfUrl.split('/storage/v1/object/sign/bidding-blocks/')
          if (parts.length > 1) path = parts[1].split('?')[0] // Remove query params
        } else if (targetPdfUrl.startsWith('bidding-docs/')) {
          path = targetPdfUrl
        } else if (targetPdfUrl.startsWith('bidding-blocks/')) {
          path = targetPdfUrl.replace(/^bidding-blocks\//, '')
        } else {
          // Default: assume it's in bidding-docs folder
          path = `bidding-docs/${targetPdfUrl.split('/').pop()}`
        }
      }
      
      if (!path && area.pdf_filename) {
        if (area.pdf_filename.startsWith('bidding-blocks/')) {
          path = area.pdf_filename.replace(/^bidding-blocks\//, '')
        } else {
          path = `bidding-docs/${area.pdf_filename}`
        }
      }
      
      if (path && path.startsWith('/')) path = path.replace(/^\/+/, '')
      return { path: path || null, bucket }
    }

    const { path: normalizedPath, bucket } = resolvePath()

    console.log('Attempting to download file from path:', normalizedPath)
    console.log('Target PDF URL:', targetPdfUrl)
    console.log('Bucket:', bucket)
    console.log('pdf_url array:', area.pdf_url)
    console.log('pdf_filename:', area.pdf_filename)
    
    if (!normalizedPath) {
      return NextResponse.json({ error: 'Could not resolve file path' }, { status: 404 })
    }
    
    // Since database stores paths as "bidding-docs/filename.pdf", use it directly
    // Only try alternative paths if the direct path fails
    const tryPaths = Array.from(new Set([
      normalizedPath, // Primary: use the path from database directly (e.g., "bidding-docs/file.pdf")
      normalizedPath.replace(/^bidding-docs\//, ''), // Fallback: try just filename at root (unlikely but possible)
    ].filter(Boolean))) as string[]

    console.log('Trying paths:', tryPaths)
    console.log('Bucket:', bucket)

    let signedUrl: string | null = null
    let lastError: any = null

    const downloadName = getDownloadName(area.name, targetPdfUrl, area.pdf_filename)

    for (const pathVariant of tryPaths) {
      console.log(`Attempting to create signed URL for path: "${pathVariant}" in bucket: "${bucket}"`)
      
      const { data: signedUrlData, error: signedUrlError } = await userSupabase.storage
        .from(bucket)
        .createSignedUrl(pathVariant, 3600, { download: downloadName }) // 1 hour expiry

      if (signedUrlError || !signedUrlData?.signedUrl) {
        lastError = signedUrlError
        console.error(`Error generating signed URL for ${bucket}:`, {
          error: signedUrlError,
          message: signedUrlError?.message,
          path: pathVariant,
          bucket
        })
        continue
      }

      console.log(`Successfully generated signed URL for path: "${pathVariant}"`)
      // Force https in case the storage endpoint returns http
      signedUrl = signedUrlData.signedUrl.startsWith('http://')
        ? signedUrlData.signedUrl.replace('http://', 'https://')
        : signedUrlData.signedUrl
      break
      }
      
    if (!signedUrl) {
      const errorMessage = lastError?.message || 'File not found in storage'
      console.error('Failed to generate signed URL. Last error:', lastError)
      console.error('Tried paths:', tryPaths)
      console.error('Target PDF URL:', targetPdfUrl)
      console.error('Normalized path:', normalizedPath)
      console.error('Area pdf_filename:', area.pdf_filename)
      console.error('Area ID:', areaId)
      
      // Return detailed error for debugging (remove in production if needed)
      return NextResponse.json({ 
        error: 'Failed to generate or fetch download URL',
        details: errorMessage,
        triedPaths: tryPaths,
        targetPdfUrl: targetPdfUrl,
        normalizedPath: normalizedPath
      }, { status: 500 })
    }

    // Log the download (non-blocking)
    logDownload(areaId, user.id, area.name, 'bidding-blocks', token)

    // For better reliability, return the signed URL as JSON
    // The client will fetch it directly, avoiding server-side TLS/network issues
    return NextResponse.json({ 
      signedUrl,
      downloadName,
      fallback: true 
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Unexpected error in download route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST route for authenticated downloads (alternative method)
export async function POST(request: NextRequest) {
  try {
    const { areaId, pdfUrl } = await request.json()

    if (!areaId) {
      return NextResponse.json({ error: 'Missing areaId parameter' }, { status: 400 })
    }

    // Get the authorization token (header or cookie)
    const token = getTokenFromRequest(request)
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 })
    }

    // Import Supabase: anon client for auth, user-scoped client for data (RLS with user JWT, no service role)
    const { supabaseAdmin: anonClient } = await import('../../../lib/supabase')
    const { createServerSupabaseClient } = await import('../../_supabaseAdmin')

    // Verify the user with the token (anon key)
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    if (authError || !user) {
      console.error('Authentication error (POST download):', authError)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const userSupabase = createServerSupabaseClient(token)

    // Get the area details (user-scoped client, respects RLS)
    const { data: areaRaw, error: areaError } = await userSupabase
      .from('areas')
      .select('id, name, pdf_url, pdf_filename')
      .eq('id', areaId)
      .single()

    if (areaError || !areaRaw) {
      console.error('Error fetching area:', areaError)
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    const area = areaRaw as { id: string; name: string; pdf_url: any; pdf_filename: string | null }

    // Determine which PDF to use
    let targetPdfUrl: string | null = null
    
    if (pdfUrl) {
      // Use the specific PDF URL provided
      targetPdfUrl = pdfUrl
    } else if (area.pdf_url) {
      // pdf_url is now a jsonb array
      if (Array.isArray(area.pdf_url) && area.pdf_url.length > 0) {
        // Use first PDF from array
        targetPdfUrl = area.pdf_url[0]
      } else if (typeof area.pdf_url === 'string') {
        // Legacy single string format (shouldn't happen after migration)
        targetPdfUrl = area.pdf_url
      }
    }

    if (!targetPdfUrl) {
      return NextResponse.json({ error: 'No PDF document available for this area' }, { status: 404 })
    }

    // Verify purchase with user-scoped client; .maybeSingle() avoids PGRST116 when 0 rows
    const { data: downloadRecord, error: downloadError } = await userSupabase
      .from('area_downloads')
      .select('id, payment_status')
      .eq('user_id', user.id)
      .eq('area_id', areaId)
      .eq('payment_status', 'completed')
      .maybeSingle()

    if (downloadError || !downloadRecord) {
      if (downloadError) console.error('Download verification error:', downloadError)
      return NextResponse.json({
        error: 'You must purchase this area before downloading the document'
      }, { status: 403 })
    }

    // Normalize path for bidding-blocks bucket (bid documents are always in bidding-blocks)
    const resolvePath = (): { path: string | null, bucket: string } => {
      let path = ''
      const bucket = 'bidding-blocks' // Bid documents are always in bidding-blocks bucket
      
      if (targetPdfUrl) {
        // Check if it's from bidding-blocks bucket
        if (targetPdfUrl.includes('/storage/v1/object/public/bidding-blocks/')) {
          const parts = targetPdfUrl.split('/storage/v1/object/public/bidding-blocks/')
          if (parts.length > 1) path = parts[1]
        } else if (targetPdfUrl.includes('/storage/v1/object/sign/bidding-blocks/')) {
          // Signed URL
          const parts = targetPdfUrl.split('/storage/v1/object/sign/bidding-blocks/')
          if (parts.length > 1) path = parts[1].split('?')[0] // Remove query params
        } else if (targetPdfUrl.startsWith('bidding-docs/')) {
          path = targetPdfUrl
        } else if (targetPdfUrl.startsWith('bidding-blocks/')) {
          path = targetPdfUrl.replace(/^bidding-blocks\//, '')
        } else {
          // Default: assume it's in bidding-docs folder
          path = `bidding-docs/${targetPdfUrl.split('/').pop()}`
        }
      }
      
      if (!path && area.pdf_filename) {
        if (area.pdf_filename.startsWith('bidding-blocks/')) {
          path = area.pdf_filename.replace(/^bidding-blocks\//, '')
        } else {
          path = `bidding-docs/${area.pdf_filename}`
        }
      }
      
      if (path && path.startsWith('/')) path = path.replace(/^\/+/, '')
      return { path: path || null, bucket }
    }

    const { path: normalizedPath, bucket } = resolvePath()

    console.log('Attempting to download file from path (POST):', normalizedPath)
    console.log('Target PDF URL:', targetPdfUrl)
    console.log('Bucket:', bucket)
    console.log('pdf_url array:', area.pdf_url)
    
    if (!normalizedPath) {
      return NextResponse.json({ error: 'Could not resolve file path' }, { status: 404 })
    }
    
    // Database stores paths as "bidding-docs/filename.pdf" - use it directly
    // Only try alternative paths if the direct path fails
    const tryPaths = Array.from(new Set([
      normalizedPath, // Primary: use the path from database directly (e.g., "bidding-docs/file.pdf")
      normalizedPath.replace(/^bidding-docs\//, ''), // Fallback: try just filename at root (unlikely but possible)
    ].filter(Boolean))) as string[]

    let signedUrl: string | null = null
    let lastError: any = null

    const downloadName = getDownloadName(area.name, targetPdfUrl, area.pdf_filename)

    for (const pathVariant of tryPaths) {
      console.log(`POST: Attempting to create signed URL for path: "${pathVariant}" in bucket: "${bucket}"`)
      
      const { data: signedUrlData, error: signedUrlError } = await userSupabase.storage
        .from(bucket)
        .createSignedUrl(pathVariant, 3600, { download: downloadName })

      if (signedUrlError || !signedUrlData?.signedUrl) {
        lastError = signedUrlError
        console.error(`POST: Error generating signed URL for ${bucket}:`, {
          error: signedUrlError,
          message: signedUrlError?.message,
          path: pathVariant,
          bucket
        })
        continue
      }

      console.log(`POST: Successfully generated signed URL for path: "${pathVariant}"`)
      // Force https in case the storage endpoint returns http
      signedUrl = signedUrlData.signedUrl.startsWith('http://')
        ? signedUrlData.signedUrl.replace('http://', 'https://')
        : signedUrlData.signedUrl
      break
    }

    if (!signedUrl) {
      console.error('POST: Failed to generate signed URL. Last error:', lastError)
      console.error('POST: Tried paths:', tryPaths)
      return NextResponse.json({ error: 'Failed to generate or fetch download URL' }, { status: 500 })
    }

    // Log the download (non-blocking)
    logDownload(areaId, user.id, area.name, 'bidding-blocks', token)

    // For better reliability, return the signed URL as JSON
    // The client will fetch it directly, avoiding server-side TLS/network issues
    return NextResponse.json({ 
      signedUrl,
      downloadName,
      fallback: true 
    }, { 
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })

  } catch (error) {
    console.error('Unexpected error in download route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}