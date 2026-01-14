import { NextRequest, NextResponse } from 'next/server'

// Helper function to log downloads
async function logDownload(areaId: string, userId: string | null, areaName: string, resourceType: string = 'bidding-blocks') {
  try {
    const { supabaseAdmin } = await import('../../_supabaseAdmin')
    const { error: logError } = await (supabaseAdmin as any)
      .from('document_downloads')
      .insert({
        document_id: areaId,
        user_id: userId, // Can be null for public users
        resource_type: resourceType,
        downloaded: new Date().toISOString()
      })

    if (logError) {
      console.error('Error logging download:', logError)
      // If table doesn't exist, this is expected - user needs to run the SQL script
      if (logError.code === 'PGRST204') {
        console.warn('document_downloads table not found. Please run the extend_document_downloads_table.sql script in Supabase Studio.')
      }
      // Don't fail the download if logging fails
    } else {
      console.log(`Download logged for ${resourceType}: user ${userId || 'public'}, area ${areaName} (${areaId})`)
    }
  } catch (logErr) {
    console.error('Unexpected error logging download:', logErr)
    // Don't fail the download if logging fails
  }
}

// Helper function to create file response
function createFileResponse(buffer: Buffer, areaName: string) {
  // Cast Buffer to BodyInit for NextResponse
  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${areaName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`,
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

// Build a safe download filename
function getDownloadName(areaName: string): string {
  const safe = areaName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document'
  return safe.endsWith('.pdf') ? safe : `${safe}.pdf`
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

    // Import Supabase clients dynamically
    const { supabase, supabaseAdmin } = await import('../../../lib/supabase')

    // Verify the user with the token using admin client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      console.error('Authentication error (GET download):', authError)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Get the area details including the PDF file paths (pdf_url is now jsonb array)
    const { data: area, error: areaError } = await supabaseAdmin
      .from('areas')
      .select('id, name, pdf_url, pdf_filename')
      .eq('id', areaId)
      .single()

    if (areaError || !area) {
      console.error('Error fetching area:', areaError)
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

    // Determine which PDF to use and if it's a brochure (free download)
    let targetPdfUrl: string | null = null
    let isBrochure = false
    
    if (pdfUrl) {
      // Use the specific PDF URL provided
      targetPdfUrl = pdfUrl
      
      // Check if this is a brochure (second item in pdf_url array if multiple, or first if only one)
      if (area.pdf_url) {
        const pdfUrls = Array.isArray(area.pdf_url) ? area.pdf_url : 
                       (typeof area.pdf_url === 'string' ? [area.pdf_url] : [])
        
        if (pdfUrls.length > 1) {
          // If multiple PDFs, brochure is the second one (index 1)
          isBrochure = pdfUrls[1] === pdfUrl || (pdfUrls[1] && (pdfUrls[1].includes(pdfUrl) || pdfUrl.includes(pdfUrls[1])))
        } else if (pdfUrls.length === 1) {
          // If only one PDF, check if it matches (could be brochure or bid doc)
          // For now, if only one PDF and it's being downloaded, treat as brochure (free)
          isBrochure = pdfUrls[0] === pdfUrl || (pdfUrls[0] && (pdfUrls[0].includes(pdfUrl) || pdfUrl.includes(pdfUrls[0])))
        }
      }
    } else if (area.pdf_url) {
      // pdf_url is now a jsonb array
      if (Array.isArray(area.pdf_url) && area.pdf_url.length > 0) {
        // Use first PDF from array
        targetPdfUrl = area.pdf_url[0]
        // If only one PDF, it's treated as brochure (free)
        isBrochure = area.pdf_url.length === 1
      } else if (typeof area.pdf_url === 'string') {
        // Legacy single string format (shouldn't happen after migration)
        targetPdfUrl = area.pdf_url
        isBrochure = true // Single PDF is brochure
      }
    }

    if (!targetPdfUrl) {
      return NextResponse.json({ error: 'No PDF document available for this area' }, { status: 404 })
    }

    // Only check purchase for bid documents (not brochures)
    if (!isBrochure) {
      const { data: downloadRecord, error: downloadError } = await supabaseAdmin
        .from('area_downloads')
        .select('id, payment_status')
        .eq('user_id', user.id)
        .eq('area_id', areaId)
        .eq('payment_status', 'completed')
        .single()

      if (downloadError || !downloadRecord) {
        console.error('Download verification error:', downloadError)
        return NextResponse.json({ 
          error: 'You must purchase this area before downloading the document' 
        }, { status: 403 })
      }
    }

    // Normalize path - brochures might be in bidding-brochure bucket, bid docs in bidding-blocks
    const resolvePath = (isBrochureFlag: boolean): { path: string | null, bucket: string } => {
      let path = ''
      let bucket = 'bidding-blocks' // Default bucket
      
      if (targetPdfUrl) {
        // Check if it's from bidding-brochure bucket (public brochures)
        if (targetPdfUrl.includes('/storage/v1/object/public/bidding-brochure/')) {
          const parts = targetPdfUrl.split('/storage/v1/object/public/bidding-brochure/')
          if (parts.length > 1) {
            path = parts[1]
            bucket = 'bidding-brochure'
          }
        } else if (targetPdfUrl.includes('/storage/v1/object/public/bidding-blocks/')) {
          const parts = targetPdfUrl.split('/storage/v1/object/public/bidding-blocks/')
          if (parts.length > 1) path = parts[1]
        } else if (targetPdfUrl.startsWith('bidding-docs/')) {
          path = targetPdfUrl
        } else if (targetPdfUrl.startsWith('bidding-blocks/')) {
          path = targetPdfUrl.replace(/^bidding-blocks\//, '')
        } else if (targetPdfUrl.startsWith('brochures/')) {
          path = targetPdfUrl
          bucket = 'bidding-brochure'
        } else {
          // If it's a brochure, try bidding-brochure bucket first
          if (isBrochureFlag) {
            bucket = 'bidding-brochure'
            path = `brochures/${targetPdfUrl.split('/').pop()}`
          } else {
            path = `bidding-docs/${targetPdfUrl.split('/').pop()}`
          }
        }
      }
      
      if (!path && area.pdf_filename) {
        if (area.pdf_filename.startsWith('bidding-blocks/')) {
          path = area.pdf_filename.replace(/^bidding-blocks\//, '')
        } else if (area.pdf_filename.startsWith('brochures/')) {
          path = area.pdf_filename
          bucket = 'bidding-brochure'
        } else {
          path = isBrochureFlag 
            ? `brochures/${area.pdf_filename}`
            : `bidding-docs/${area.pdf_filename}`
          if (isBrochureFlag) bucket = 'bidding-brochure'
        }
      }
      
      if (path && path.startsWith('/')) path = path.replace(/^\/+/, '')
      return { path: path || null, bucket }
    }

    const { path: normalizedPath, bucket } = resolvePath(isBrochure)

    console.log('Attempting to download file from path:', normalizedPath)
    console.log('Target PDF URL:', targetPdfUrl)
    console.log('Is brochure:', isBrochure)
    console.log('Bucket:', bucket)
    console.log('pdf_url array:', area.pdf_url)
    
    if (!normalizedPath) {
      return NextResponse.json({ error: 'Could not resolve file path' }, { status: 404 })
    }
    
    const tryPaths = Array.from(new Set(
      [normalizedPath, normalizedPath.startsWith(bucket + '/') ? normalizedPath : `${bucket}/${normalizedPath}`]
        .filter(Boolean)
    )) as string[]

    let signedUrl: string | null = null
    let lastError: any = null

    const downloadName = getDownloadName(area.name)

    for (const pathVariant of tryPaths) {
      // Remove bucket prefix if present (createSignedUrl needs path without bucket)
      const cleanPath = pathVariant.startsWith(bucket + '/') 
        ? pathVariant.replace(new RegExp(`^${bucket}/`), '')
        : pathVariant
      
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(cleanPath, 3600, { download: downloadName }) // 1 hour expiry

      if (signedUrlError || !signedUrlData?.signedUrl) {
        lastError = signedUrlError
        console.error(`Error generating signed URL for ${bucket}:`, signedUrlError, 'path:', cleanPath)
        continue
      }

      // Force https in case the storage endpoint returns http
      signedUrl = signedUrlData.signedUrl.startsWith('http://')
        ? signedUrlData.signedUrl.replace('http://', 'https://')
        : signedUrlData.signedUrl
      break
      }
      
    if (!signedUrl) {
      console.error('Failed to generate signed URL. Last error:', lastError)
      console.error('Tried paths:', tryPaths)
      return NextResponse.json({ error: 'Failed to generate or fetch download URL' }, { status: 500 })
    }

    // Log the download
    await logDownload(areaId, user.id, area.name)

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

    // Import Supabase clients dynamically
    const { supabase, supabaseAdmin } = await import('../../../lib/supabase')

    // Verify the user with the token
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      console.error('Authentication error (POST download):', authError)
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    // Get the area details including the PDF file paths (pdf_url is now jsonb array)
    const { data: area, error: areaError } = await supabaseAdmin
      .from('areas')
      .select('id, name, pdf_url, pdf_filename')
      .eq('id', areaId)
      .single()

    if (areaError || !area) {
      console.error('Error fetching area:', areaError)
      return NextResponse.json({ error: 'Area not found' }, { status: 404 })
    }

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

    // Check if user has purchased this area
    const { data: downloadRecord, error: downloadError } = await supabaseAdmin
      .from('area_downloads')
      .select('id, payment_status')
      .eq('user_id', user.id)
      .eq('area_id', areaId)
      .eq('payment_status', 'completed')
      .single()

    if (downloadError || !downloadRecord) {
      console.error('Download verification error:', downloadError)
      return NextResponse.json({ 
        error: 'You must purchase this area before downloading the document' 
      }, { status: 403 })
    }

    // Normalize path (same logic as GET)
    const resolvePath = (): string | null => {
      let path = ''
    if (targetPdfUrl) {
        if (targetPdfUrl.includes('/storage/v1/object/public/bidding-blocks/')) {
          const parts = targetPdfUrl.split('/storage/v1/object/public/bidding-blocks/')
          if (parts.length > 1) path = parts[1]
        } else if (targetPdfUrl.startsWith('bidding-docs/')) {
          path = targetPdfUrl
        } else if (targetPdfUrl.startsWith('bidding-blocks/')) {
          path = targetPdfUrl.replace(/^bidding-blocks\//, '')
      } else {
          path = `bidding-docs/${targetPdfUrl.split('/').pop()}`
      }
    }
      if (!path && area.pdf_filename) {
        path = area.pdf_filename.startsWith('bidding-blocks/')
          ? area.pdf_filename.replace(/^bidding-blocks\//, '')
          : `bidding-docs/${area.pdf_filename}`
      }
      if (path.startsWith('/')) path = path.replace(/^\/+/, '')
      return path || null
    }

    const normalizedPath = resolvePath()

    console.log('Attempting to download file from path (POST):', normalizedPath)
    console.log('Target PDF URL:', targetPdfUrl)
    console.log('pdf_url array:', area.pdf_url)
    
    // Generate signed URL and redirect
    let signedUrl: string | null = null
    let lastError: any = null

    const downloadName = getDownloadName(area.name)

    for (const pathVariant of Array.from(new Set(
      [normalizedPath, normalizedPath ? `bidding-blocks/${normalizedPath}` : null]
        .filter(Boolean)
    )) as string[]) {
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from('bidding-blocks')
        .createSignedUrl(pathVariant, 3600, { download: downloadName })

      if (signedUrlError || !signedUrlData?.signedUrl) {
        lastError = signedUrlError
        console.error('POST: Error generating signed URL for bidding-blocks:', signedUrlError, 'path:', pathVariant)
        continue
      }

      signedUrl = signedUrlData.signedUrl.startsWith('http://')
        ? signedUrlData.signedUrl.replace('http://', 'https://')
        : signedUrlData.signedUrl
      break
    }

    if (!signedUrl) {
      console.error('POST: Failed to generate download URL', lastError)
      return NextResponse.json({ error: 'Failed to generate or fetch download URL' }, { status: 500 })
    }

    // Log the download
    await logDownload(areaId, user.id, area.name)

    // Fetch the file from the signed URL and return it as a blob
    try {
      const fileBuffer = await fetchSignedUrlFile(signedUrl)
      const downloadName = getDownloadName(area.name)
      
      return new NextResponse(fileBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${downloadName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    } catch (fetchError) {
      console.error('POST: Error fetching file from signed URL:', fetchError)
      // Fallback: redirect to signed URL if direct fetch fails
      return NextResponse.redirect(signedUrl)
    }

  } catch (error) {
    console.error('Unexpected error in download route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}