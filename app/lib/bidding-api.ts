import { supabase } from './supabase'

export interface Block {
  id: string
  name: string
  type: 'onshore' | 'offshore'
  description: string
  created_at: string
  updated_at: string
}

export interface Zone {
  id: string
  block_id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}

export interface Area {
  id: string
  zone_id: string
  name: string
  code: string
  description: string
  pdf_url: string[] | null // JSONB array of PDF URLs
  pdf_filename: string | null
  price: number
  is_active: boolean
  created_at: string
  updated_at: string
  // GeoJSON fields
  geometry?: any
  properties?: any
  block_code?: string
  status?: string
  winners?: string
  geological_province?: string
  area_sqkm?: number
  license_number?: string
  start_date?: string
  end_date?: string
  bidders?: string
  work_unit_offered?: number
  brochure_url?: string
  thumbnail_url?: string
  // Legacy fields (for backward compatibility)
  operator?: string
  joint_venture?: string
}

export interface AreaDownload {
  id: string
  user_id: string
  area_id: string
  payment_status: 'pending' | 'completed' | 'failed'
  payment_amount: number
  payment_method: string | null
  transaction_id: string | null
  downloaded_at: string | null
  created_at: string
  updated_at: string
}

export interface BlockWithZones extends Block {
  zones: (Zone & { areas: Area[] })[]
}

// Fetch all blocks with their zones and areas (public access)
export async function getBiddingBlocks(): Promise<BlockWithZones[]> {
  try {
    // Use the public API endpoint to bypass RLS for public data
    const response = await fetch('/api/bidding-blocks/public', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add cache control to prevent stale data
      cache: 'no-store',
    })

    if (!response.ok) {
      let errorMessage = 'Failed to fetch bidding blocks'
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || `HTTP ${response.status}`
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    
    // Validate response data
    if (!Array.isArray(data)) {
      console.error('Invalid response format:', data)
      throw new Error('Invalid data format received from server')
    }
    
    return data || []
  } catch (error: any) {
    console.error('Error fetching bidding blocks:', error)
    
    // Provide more specific error messages
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to server')
    }
    
    if (error.message) {
      throw error
    }
    
    throw new Error('Failed to fetch bidding blocks. Please try again.')
  }
}

// Check if user has already purchased/downloaded an area
export async function checkUserDownload(areaId: string): Promise<AreaDownload | null> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null

  const { data, error } = await supabase
    .from('area_downloads')
    .select('*')
    .eq('user_id', user.id)
    .eq('area_id', areaId)
    .eq('payment_status', 'completed')
    .maybeSingle()

  if (error) {
    console.error('Error checking user download:', error)
    return null
  }

  return data
}

// Create a new download record (purchase)
export async function purchaseArea(areaId: string, paymentMethod: string): Promise<AreaDownload> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get area details for price
  const { data: area, error: areaError } = await supabase
    .from('areas')
    .select('price')
    .eq('id', areaId)
    .maybeSingle()

  if (areaError || !area) {
    throw new Error('Area not found')
  }

  // Create download record
  const { data, error } = await supabase
    .from('area_downloads')
    .insert({
      user_id: user.id,
      area_id: areaId,
      payment_status: 'completed', // For dummy payment, mark as completed immediately
      payment_amount: area.price,
      payment_method: paymentMethod,
      transaction_id: `dummy_${Date.now()}`,
      downloaded_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error) {
    throw new Error('Failed to create purchase record')
  }

  return data
}

// Get user's downloads
export async function getUserDownloads(): Promise<(AreaDownload & { areas: Area })[]> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return []

  const { data, error } = await supabase
    .from('area_downloads')
    .select(`
      *,
      areas (*)
    `)
    .eq('user_id', user.id)
    .eq('payment_status', 'completed')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching user downloads:', error)
    return []
  }

  return data || []
}

// Get all user downloads for quick lookup
export async function getUserDownloadedAreaIds(): Promise<Set<string>> {
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return new Set()

  const { data, error } = await supabase
    .from('area_downloads')
    .select('area_id')
    .eq('user_id', user.id)
    .eq('payment_status', 'completed')

  if (error) {
    console.error('Error fetching user download IDs:', error)
    return new Set()
  }

  return new Set((data || []).map(item => item.area_id))
}

// File upload functions
export async function uploadBiddingDocument(
  file: File,
  areaId: string,
  title: string
): Promise<{ area: Area; fileUrl: string; fileName: string; fileSize: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('areaId', areaId)
  formData.append('title', title)

  const response = await fetch('/api/bidding-blocks/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to upload document')
  }

  return response.json()
}

export async function deleteBiddingDocument(areaId: string): Promise<Area> {
  const response = await fetch(`/api/bidding-blocks/upload?areaId=${areaId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete document')
  }

  return response.json()
}

// Admin functions
export async function createArea(areaData: {
  zone_id: string
  name: string
  code?: string
  description?: string
  price: number
  pdf_url?: string
  pdf_filename?: string
}): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .insert(areaData)
    .select()
    .maybeSingle()

  if (error || !data) {
    throw new Error('Failed to create area')
  }

  return data
}

export async function updateArea(id: string, updates: Partial<Area>): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating area:', error)
    throw new Error(`Failed to update area: ${error.message}`)
  }

  if (!data) {
    throw new Error('Area not found or no data returned from update operation')
  }

  return data
}

export async function deleteArea(id: string): Promise<void> {
  const { error } = await supabase
    .from('areas')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error('Failed to delete area')
  }
}

// Zone management functions
export async function createZone(zoneData: {
  block_id: string
  name: string
  description?: string
}): Promise<Zone> {
  const { data, error } = await supabase
    .from('zones')
    .insert(zoneData)
    .select()
    .maybeSingle()

  if (error || !data) {
    console.error('Error creating zone:', error)
    throw new Error(`Failed to create zone: ${error?.message || 'Unknown error'}`)
  }

  return data
}

export async function updateZone(id: string, updates: Partial<Zone>): Promise<Zone> {
  const { data, error } = await supabase
    .from('zones')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating zone:', error)
    throw new Error(`Failed to update zone: ${error.message}`)
  }

  if (!data) {
    throw new Error('Zone not found or no data returned from update operation')
  }

  return data
}

export async function deleteZone(id: string): Promise<void> {
  const { error } = await supabase
    .from('zones')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting zone:', error)
    throw new Error(`Failed to delete zone: ${error.message}`)
  }
}

// Block management functions
export async function createBlock(blockData: {
  name: string
  type: 'onshore' | 'offshore'
  description?: string
}): Promise<Block> {
  const { data, error } = await supabase
    .from('blocks')
    .insert(blockData)
    .select()
    .maybeSingle()

  if (error || !data) {
    console.error('Error creating block:', error)
    throw new Error(`Failed to create block: ${error?.message || 'Unknown error'}`)
  }

  return data
}

export async function updateBlock(id: string, updates: Partial<Block>): Promise<Block> {
  const { data, error } = await supabase
    .from('blocks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating block:', error)
    throw new Error(`Failed to update block: ${error.message}`)
  }

  if (!data) {
    throw new Error('Block not found or no data returned from update operation')
  }

  return data
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting block:', error)
    throw new Error(`Failed to delete block: ${error.message}`)
  }
}

// Download functionality
async function getFreshAccessToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session?.access_token) {
    throw new Error('User not authenticated')
  }

  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
  const isExpiringSoon = expiresAt > 0 && expiresAt < Date.now() + 60_000

  if (isExpiringSoon) {
    const { data, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !data?.session?.access_token) {
      throw new Error('Session expired. Please sign in again.')
    }
    return data.session.access_token
  }

  return session.access_token
}

async function authorizedDownload(url: string): Promise<Blob> {
  // Ensure we always use a fresh/valid token to avoid 401s from expired sessions
  const token = await getFreshAccessToken()

  const attempt = async (accessToken: string) => {
    const response = await fetch(url, {
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    return response
  }

  // First attempt with current/possibly refreshed token
  let response = await attempt(token)

  // If token is rejected, force a refresh once and retry
  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session?.access_token) {
      response = await attempt(data.session.access_token)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to download document')
  }

  // Check if response is a JSON with signedUrl (fallback mode)
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const data = await response.json()
    if (data.signedUrl) {
      // Fetch from the signed URL directly
      const fileResponse = await fetch(data.signedUrl)
      if (!fileResponse.ok) {
        throw new Error('Failed to download from signed URL')
      }
      return fileResponse.blob()
    }
  }

  return response.blob()
}

export async function downloadAreaDocument(areaId: string): Promise<Blob> {
  return authorizedDownload(`/api/bidding-blocks/download?areaId=${areaId}`)
}

export async function downloadAreaDocumentByUrl(areaId: string, pdfUrl: string): Promise<Blob> {
  const url = `/api/bidding-blocks/download?areaId=${areaId}&pdfUrl=${encodeURIComponent(pdfUrl)}`
  return authorizedDownload(url)
}

export async function downloadAreaDocumentWithAuth(areaId: string): Promise<Blob> {
  const token = await getFreshAccessToken()

  const attempt = async (accessToken: string) => {
    return fetch(`/api/bidding-blocks/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ areaId }),
  })
  }

  let response = await attempt(token)

  // Retry once on 401 with a forced refresh
  if (response.status === 401) {
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data?.session?.access_token) {
      response = await attempt(data.session.access_token)
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to download document')
  }

  return response.blob()
}

// Payment-related functions
export interface PaymentWithDetails extends AreaDownload {
  user_email: string
  company_name: string | null
  address: string | null
  poc_contact_number: string | null
  area_name: string
  area_code: string
  zone_name: string
  block_name: string
  block_type: 'onshore' | 'offshore'
}

export async function getAllPayments(): Promise<PaymentWithDetails[]> {
  const { data, error } = await supabase
    .from('area_downloads')
    .select(`
      *,
      areas!inner(
        name,
        code,
        zones!inner(
          name,
          blocks!inner(
            name,
            type
          )
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching payments:', error)
    throw new Error('Failed to fetch payments')
  }

  // Get user emails and company details from user_profiles and auth.users
  const paymentsWithUserInfo: PaymentWithDetails[] = []
  
  // Collect all unique user IDs
  const userIds = Array.from(new Set((data || []).map(p => p.user_id)))
  
  // Fetch all user profiles in one query
  const { data: userProfiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, company_name, address, poc_contact_number')
    .in('user_id', userIds)
  
  // Create a map for quick lookup
  const profileMap = new Map(
    (userProfiles || []).map(profile => [profile.user_id, profile])
  )
  
  // Fetch user emails from auth.users
  const userEmailMap = new Map<string, string>()
  for (const userId of userIds) {
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(userId)
      if (userData.user?.email) {
        userEmailMap.set(userId, userData.user.email)
      }
    } catch (authError) {
      // If we can't access auth.users, skip this user
      console.log(`Could not fetch user email for ${userId}:`, authError)
    }
  }
  
  for (const payment of data || []) {
    // Get user email (from auth.users or fallback)
    const userEmail = userEmailMap.get(payment.user_id) || `user-${payment.user_id.slice(0, 8)}@example.com`
    
    // Get user profile data
    const profile = profileMap.get(payment.user_id)
    
    paymentsWithUserInfo.push({
      ...payment,
      user_email: userEmail,
      company_name: profile?.company_name || null,
      address: profile?.address || null,
      poc_contact_number: profile?.poc_contact_number || null,
      area_name: payment.areas.name,
      area_code: payment.areas.code,
      zone_name: payment.areas.zones.name,
      block_name: payment.areas.zones.blocks.name,
      block_type: payment.areas.zones.blocks.type,
    })
  }

  return paymentsWithUserInfo
}

export async function updatePaymentStatus(
  paymentId: string, 
  status: 'pending' | 'completed' | 'failed'
): Promise<void> {
  const { error } = await supabase
    .from('area_downloads')
    .update({ 
      payment_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', paymentId)

  if (error) {
    console.error('Error updating payment status:', error)
    throw new Error('Failed to update payment status')
  }
}

// Dashboard statistics functions
export interface DashboardStats {
  totalUsers: number
  totalPosts: number
  totalDownloads: number
  revenue: number
  recentActivity: Array<{
    id: string
    type: string
    user: string
    timestamp: string
    description: string
    amount?: string
  }>
  popularBlocks: Array<{
    name: string
    downloads: number
    revenue: number
  }>
}

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })

    // Get total blog posts
    const { count: totalPosts } = await supabase
      .from('blogs')
      .select('*', { count: 'exact', head: true })

    // Get total downloads and revenue
    const { data: downloadsData, error: downloadsError } = await supabase
      .from('area_downloads')
      .select('payment_amount, payment_status')
      .eq('payment_status', 'completed')

    if (downloadsError) {
      console.error('Error fetching downloads:', downloadsError)
    }

    const totalDownloads = downloadsData?.length || 0
    const revenue = downloadsData?.reduce((sum, item) => sum + (parseFloat(item.payment_amount) || 0), 0) || 0

    // Get recent activity (last 10 downloads)
    const { data: recentDownloads, error: activityError } = await supabase
      .from('area_downloads')
      .select(`
        id,
        created_at,
        payment_amount,
        payment_status,
        areas!inner(
          name,
          zones!inner(
            name,
            blocks!inner(
              name
            )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (activityError) {
      console.error('Error fetching recent activity:', activityError)
    }

    // Format recent activity
    const recentActivity = (recentDownloads || []).map((download, index) => ({
      id: download.id,
      type: 'block_download',
      user: `User ${download.id.slice(0, 8)}`, // We can't access user emails due to RLS
      timestamp: new Date(download.created_at).toLocaleString(),
      description: `Downloaded ${(download.areas as any).zones?.blocks?.name || 'Unknown Block'} - ${(download.areas as any).name || 'Unknown Area'}`,
      amount: download.payment_status === 'completed' ? `$${parseFloat(download.payment_amount).toFixed(2)}` : undefined
    }))

    // Get popular blocks (most downloaded areas)
    const { data: popularBlocksData, error: popularError } = await supabase
      .from('area_downloads')
      .select(`
        area_id,
        payment_amount,
        payment_status,
        areas!inner(
          name,
          zones!inner(
            name,
            blocks!inner(
              name
            )
          )
        )
      `)
      .eq('payment_status', 'completed')

    if (popularError) {
      console.error('Error fetching popular blocks:', popularError)
    }

    // Group by area and calculate stats
    const blockStats = new Map<string, { downloads: number; revenue: number; name: string }>()
    
    ;(popularBlocksData || []).forEach(download => {
      const blockName = (download.areas as any).zones?.blocks?.name || 'Unknown Block'
      const current = blockStats.get(blockName) || { downloads: 0, revenue: 0, name: blockName }
      current.downloads += 1
      current.revenue += parseFloat(download.payment_amount) || 0
      blockStats.set(blockName, current)
    })

    const popularBlocks = Array.from(blockStats.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 5)

    return {
      totalUsers: totalUsers || 0,
      totalPosts: totalPosts || 0,
      totalDownloads,
      revenue,
      recentActivity,
      popularBlocks
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    throw new Error('Failed to fetch dashboard statistics')
  }
}
