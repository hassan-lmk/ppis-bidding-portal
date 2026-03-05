'use client'

import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { downloadAreaDocumentByUrl, Area } from '../lib/bidding-api'
import { useCart } from '../lib/cart-context'
import BiddingPortalLayout, { PortalTab } from '../components/BiddingPortalLayout'
import { generatePaymentReceipt, PaymentReceiptData } from '../lib/receipt-generator'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Skeleton } from '../components/ui/skeleton'
import {
  Download,
  AlertCircle,
  CheckCircle2,
  FileText,
  Send,
  Clock,
  CheckCircle,
  MapPin,
  Trophy,
  FileCheck,
  Loader2,
  Lock,
  FolderOpen,
  FileStack,
  ClipboardCheck,
  ShoppingCart,
  MessageSquare,
  Plus,
  ChevronRight,
  CreditCard,
  Receipt,
  User
} from 'lucide-react'

// Dynamically import the map component to avoid SSR issues
const InteractiveMapComponent = dynamic(
  () => import('../components/InteractiveMapPortal'),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen bg-gray-900 rounded-xl flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    )
  }
)

// Lazy load CartModal to avoid SSR issues
const CartModal = lazy(() => import('../components/CartModal'))

// Build a usable brochure link from what's stored in the database.
// Supports both full URLs (leave untouched) and storage object paths.
const getBrochureHref = (brochureUrl?: string | null) => {
  if (!brochureUrl) return null

  const trimmed = brochureUrl.trim()
  if (!trimmed) return null

  // If it's already a full URL (public or signed), use it directly
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }

  // Otherwise, treat it as a storage object path
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null

  // Avoid double bucket prefixes if the path already includes one
  const normalizedPath = trimmed.replace(/^\/+/, '')
  const hasBucketPrefix =
    normalizedPath.startsWith('storage/v1/object/public/') ||
    normalizedPath.startsWith('bidding-brochure/')

  const pathWithBucket = hasBucketPrefix
    ? normalizedPath
    : `bidding-brochure/${normalizedPath}`

  return `${supabaseUrl}/storage/v1/object/public/${pathWithBucket}`
}

interface OpenBlock {
  id: string
  name: string
  code: string
  status: string
  zone_id: string
  zone_name: string
  block_name: string
  block_type: string
  price: number
  bid_submission_deadline: string | null
  pdf_url: string[] | null
  brochure_url: string | null
  isPurchased: boolean
}

interface PurchasedArea {
  id: string
  area_id: string
  area_name: string
  brochure_url?: string | null
  area_code: string
  zone_name: string
  block_name: string
  block_type: string
  downloaded_at: string | null
  pdf_url: string[] | null
  bid_submission_deadline: string | null
  work_program_opens_at: string | null
  bid_application?: {
    id: string
    status: string
    submitted_at: string | null
    primary_applicant_name: string
    submission_type: string
    work_units: number | null
    work_units_status: string | null
    work_units_submitted_at: string | null
  } | null
}

interface SubmittedApplication {
  id: string
  area_id: string
  area_name: string
  area_code: string
  primary_applicant_name: string
  submission_type: string
  status: string
  submitted_at: string
  work_units: number | null
  work_units_status: string | null
}

interface Ticket {
  id: string
  ticket_number: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  created_at: string
  updated_at: string
}

interface BiddingDocumentPayment {
  id: string
  order_id: string
  basket_id: string
  area_name: string
  area_code: string
  amount: number
  currency: string
  status: string
  transaction_id: string | null
  payment_method: string
  created_at: string
  paid_at: string | null
}

interface ApplicationFeePayment {
  id: string
  bid_application_id: string
  area_name: string
  area_code: string
  amount: number
  currency: string
  status: string
  payment_method: string | null
  transaction_id: string | null
  bank_name: string | null
  challan_number: string | null
  challan_date: string | null
  created_at: string
  paid_at: string | null
  payment_raw_payload?: any // JSONB field containing PayFast response
}

function BiddingPortalContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as PortalTab | null
  const [activeTab, setActiveTab] = useState<PortalTab>(tabParam || 'opened-bidding')
  const [openBlocks, setOpenBlocks] = useState<OpenBlock[]>([])
  const [openBlocksView, setOpenBlocksView] = useState<'open' | 'purchased'>('open')
  const [purchasedAreas, setPurchasedAreas] = useState<PurchasedArea[]>([])
  const [submittedApps, setSubmittedApps] = useState<SubmittedApplication[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [biddingDocPayments, setBiddingDocPayments] = useState<BiddingDocumentPayment[]>([])
  const [applicationFeePayments, setApplicationFeePayments] = useState<ApplicationFeePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingAreas, setDownloadingAreas] = useState<Set<string>>(new Set())
  const [downloadingReceipts, setDownloadingReceipts] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(new Date())
  const [portalEnabled, setPortalEnabled] = useState<boolean | null>(null)
  const [bidSubmissionClosingDate, setBidSubmissionClosingDate] = useState<Date | null>(null)
  
  // Track which tabs have been loaded to avoid refetching
  const [loadedTabs, setLoadedTabs] = useState<Set<PortalTab>>(new Set())
  const [tabLoading, setTabLoading] = useState<Record<PortalTab, boolean>>({
    'opened-bidding': false,
    'purchased-documents': false,
    'submitted-applications': false,
    'support': false,
    'payments': false,
    'interactive-map': false,
    'bid-submission': false,
    'submit-bids': false
  })
  
  // Ticket creation
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: '', description: '', category: 'general' })
  const [creatingTicket, setCreatingTicket] = useState(false)
  
  // Cart state
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [cartExpanded, setCartExpanded] = useState(false)
  const [cartHovered, setCartHovered] = useState(false)
  
  const { user, loading: authLoading, session, userProfile } = useAuth()
  const { addToCart, isInCart, getTotalItems } = useCart()
  const router = useRouter()

  // Helper function to get auth token - redirects to login if session expired
  async function getAuthToken() {
    if (session?.access_token) {
      // Check if token is about to expire (within 60 seconds)
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0
      if (expiresAt > 0 && expiresAt < Date.now() + 60000) {
        // Try to refresh the session
        const { data, error } = await supabase.auth.refreshSession()
        if (error || !data?.session?.access_token) {
          // Session expired and couldn't refresh - redirect to login
          router.push('/login?redirect=/bidding-portal')
          throw new Error('Session expired. Redirecting to login...')
        }
        return data.session.access_token
      }
      return session.access_token
    }
    const { data: { session: newSession } } = await supabase.auth.getSession()
    if (!newSession?.access_token) {
      // No session - redirect to login
      router.push('/login?redirect=/bidding-portal')
      throw new Error('Session expired. Redirecting to login...')
    }
    return newSession.access_token
  }

  // Helper function to handle API errors and redirect on 401
  function handleApiError(error: any, response?: Response) {
    if (response?.status === 401 || error?.message?.includes('Unauthorized') || error?.message?.includes('Session expired')) {
      router.push('/login?redirect=/bidding-portal')
      return true
    }
    return false
  }

  // Convert OpenBlock to Area format for cart
  const convertBlockToArea = (block: OpenBlock): Area => {
    return {
      id: block.id,
      zone_id: block.zone_id,
      name: block.name,
      code: block.code,
      description: `${block.block_name} - ${block.zone_name}`,
      pdf_url: block.pdf_url,
      pdf_filename: block.pdf_url && block.pdf_url.length > 0 ? block.pdf_url[0].split('/').pop() || null : null,
      price: block.price,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  // Handle add to cart
  const handleAddToCart = (block: OpenBlock) => {
    if (block.isPurchased) {
      return // Don't add purchased items to cart
    }
    const area = convertBlockToArea(block)
    addToCart(area)
  }

  // Update active tab when URL changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  // Update current time every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch bid submission closing date
  useEffect(() => {
    let isMounted = true
    
    const fetchClosingDate = async () => {
      if (!user) return
      
      try {
        const token = await getAuthToken()
        const response = await fetch('/api/bidding-portal/closing-date', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        
        if (response.ok) {
          const data = await response.json()
          if (isMounted && data.bid_submission_closing_date) {
            setBidSubmissionClosingDate(new Date(data.bid_submission_closing_date))
          }
        } else if (response.status === 401) {
          handleApiError(null, response)
        }
      } catch (err: any) {
        console.error('Error fetching closing date:', err)
        // Check if it's a session error
        if (err?.message?.includes('Session expired')) {
          // Already handled by getAuthToken
          return
        }
      }
    }
    
    fetchClosingDate()
    
    return () => {
      isMounted = false
    }
  }, [user])

  // Check if bidding portal is enabled - using cached status
  useEffect(() => {
    let isMounted = true
    
    const checkPortalStatus = async () => {
      try {
        const { getBiddingPortalStatus } = await import('../lib/bidding-portal-cache')
        const enabled = await getBiddingPortalStatus()
        
        if (isMounted) {
          setPortalEnabled(enabled)
          
          if (!enabled) {
            setLoading(false)
            return
          }
        }
      } catch (err) {
        console.error('Error checking portal status:', err)
        if (isMounted) {
          // Default to enabled if check fails
          setPortalEnabled(true)
        }
      }
    }
    
    checkPortalStatus()
    
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/bidding-portal')
      return
    }

    if (user && portalEnabled !== false) {
      setLoading(false) // Initial loading complete
      // Fetch data for the active tab only
      fetchTabData(activeTab)
    }
  }, [user, authLoading, router, portalEnabled])

  // Fetch data when active tab changes
  useEffect(() => {
    if (user && portalEnabled !== false && activeTab) {
      fetchTabData(activeTab)
    }
  }, [activeTab, user, portalEnabled])

  // Fetch data for a specific tab
  const fetchTabData = async (tab: PortalTab) => {
    // Skip if already loaded
    if (loadedTabs.has(tab)) {
      return
    }

    try {
      setTabLoading(prev => ({ ...prev, [tab]: true }))

      switch (tab) {
        case 'opened-bidding':
          await fetchOpenedBiddingData()
          break
        case 'purchased-documents':
          await fetchPurchasedDocumentsData()
          break
        case 'submitted-applications':
          await fetchSubmittedApplicationsData()
          break
        case 'support':
          await fetchSupportData()
          break
        case 'payments':
          await fetchPaymentsData()
          break
        case 'interactive-map':
          // No data needed for map
          break
      }

      setLoadedTabs(prev => new Set(prev).add(tab))
    } catch (err: any) {
      console.error(`Error fetching data for tab ${tab}:`, err)
      // Check if it's a session error - don't show error message if redirecting
      if (err?.message?.includes('Session expired') || err?.message?.includes('Redirecting to login')) {
        return
      }
      setError('An unexpected error occurred')
    } finally {
      setTabLoading(prev => ({ ...prev, [tab]: false }))
    }
  }

  // Fetch opened bidding data
  const fetchOpenedBiddingData = async () => {
    // Fetch all open blocks
    const { data: areasData } = await supabase
      .from('areas')
      .select(`
        id, name, code, status, price, bid_submission_deadline, pdf_url, brochure_url, zone_id,
        zones!inner(
          name,
          blocks!inner(name, type)
        )
      `)
      .eq('status', 'Open')
      .order('name')

    // Fetch user's purchased areas to check which are purchased
    const { data: purchasedData } = await supabase
      .from('area_downloads')
      .select('area_id')
      .eq('user_id', user?.id)
      .eq('payment_status', 'completed')

    const purchasedAreaIds = (purchasedData || []).map((d: any) => d.area_id)

    // Transform data
    const openBlocksData: OpenBlock[] = (areasData || []).map((area: any) => ({
      id: area.id,
      name: area.name,
      code: area.code,
      status: area.status,
      zone_id: area.zone_id,
      zone_name: area.zones.name,
      block_name: area.zones.blocks.name,
      block_type: area.zones.blocks.type,
      price: area.price || 0,
      bid_submission_deadline: area.bid_submission_deadline,
      pdf_url: Array.isArray(area.pdf_url) ? area.pdf_url : area.pdf_url ? [area.pdf_url] : null,
      brochure_url: area.brochure_url,
      isPurchased: purchasedAreaIds.includes(area.id)
    }))

    setOpenBlocks(openBlocksData)
  }

  // Fetch purchased documents data
  const fetchPurchasedDocumentsData = async () => {
    const { data: purchasedData } = await supabase
      .from('area_downloads')
      .select(`
        id,
        area_id,
        downloaded_at,
        payment_status,
        areas!inner(
          id, name, code, pdf_url, brochure_url, status, bid_submission_deadline, work_program_opens_at,
          zones!inner(
            name,
            blocks!inner(name, type)
          )
        )
      `)
      .eq('user_id', user?.id)
      .eq('payment_status', 'completed')

    const purchasedAreaIds = (purchasedData || []).map((d: any) => d.area_id)

    // Fetch bid applications for purchased areas
    let bidAppsMap = new Map()
    if (purchasedAreaIds.length > 0) {
      const { data: bidApps } = await supabase
        .from('bid_applications')
        .select('*')
        .eq('user_id', user?.id)
        .in('area_id', purchasedAreaIds)

      if (bidApps) {
        bidApps.forEach((app: any) => {
          bidAppsMap.set(app.area_id, app)
        })
      }
    }

    const purchasedAreasData: PurchasedArea[] = (purchasedData || []).map((download: any) => {
      const bidApp = bidAppsMap.get(download.area_id)
      return {
        id: download.id,
        area_id: download.area_id,
        area_name: download.areas.name,
        area_code: download.areas.code,
        zone_name: download.areas.zones.name,
        block_name: download.areas.zones.blocks.name,
        block_type: download.areas.zones.blocks.type,
        downloaded_at: download.downloaded_at,
        pdf_url: Array.isArray(download.areas.pdf_url) ? download.areas.pdf_url : download.areas.pdf_url ? [download.areas.pdf_url] : null,
        brochure_url: download.areas.brochure_url,
        bid_submission_deadline: download.areas.bid_submission_deadline,
        work_program_opens_at: download.areas.work_program_opens_at,
        bid_application: bidApp ? {
          id: bidApp.id,
          status: bidApp.status,
          submitted_at: bidApp.submitted_at,
          primary_applicant_name: bidApp.primary_applicant_name,
          submission_type: bidApp.submission_type,
          work_units: bidApp.work_units,
          work_units_status: bidApp.work_units_status,
          work_units_submitted_at: bidApp.work_units_submitted_at
        } : null
      }
    })

    setPurchasedAreas(purchasedAreasData)
  }

  // Fetch submitted applications data
  const fetchSubmittedApplicationsData = async () => {
    // First fetch purchased areas to get submitted applications
    if (!loadedTabs.has('purchased-documents')) {
      await fetchPurchasedDocumentsData()
    }

    // Fetch bid applications directly
    const { data: purchasedData } = await supabase
      .from('area_downloads')
      .select('area_id')
      .eq('user_id', user?.id)
      .eq('payment_status', 'completed')

    const purchasedAreaIds = (purchasedData || []).map((d: any) => d.area_id)

    if (purchasedAreaIds.length > 0) {
      const { data: bidApps } = await supabase
        .from('bid_applications')
        .select(`
          id,
          area_id,
          status,
          submitted_at,
          primary_applicant_name,
          submission_type,
          work_units,
          work_units_status,
          areas!inner(
            name,
            code
          )
        `)
        .eq('user_id', user?.id)
        .in('area_id', purchasedAreaIds)
        .in('status', ['submitted', 'under_review', 'approved'])

      const submittedData: SubmittedApplication[] = (bidApps || []).map((app: any) => ({
        id: app.id,
        area_id: app.area_id,
        area_name: app.areas?.name || 'Unknown',
        area_code: app.areas?.code || '',
        primary_applicant_name: app.primary_applicant_name,
        submission_type: app.submission_type,
        status: app.status,
        submitted_at: app.submitted_at!,
        work_units: app.work_units,
        work_units_status: app.work_units_status
      }))

      setSubmittedApps(submittedData)
    } else {
      setSubmittedApps([])
    }
  }

  // Fetch support data
  const fetchSupportData = async () => {
    const token = await getAuthToken()
    const ticketsRes = await fetch('/api/tickets', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (ticketsRes.ok) {
      const ticketsData = await ticketsRes.json()
      setTickets(ticketsData)
    } else if (ticketsRes.status === 401) {
      handleApiError(null, ticketsRes)
    }
  }

  // Fetch payments data
  const fetchPaymentsData = async () => {
    // Fetch bidding document payments (from orders via area_downloads)
    const { data: downloadsData } = await supabase
      .from('area_downloads')
      .select(`
        id,
        order_id,
        area_id,
        payment_status,
        created_at,
        orders!inner(
          id,
          basket_id,
          status,
          total_amount,
          txnid,
          created_at,
          updated_at
        ),
        areas!inner(
          name,
          code
        )
      `)
      .eq('user_id', user?.id)
      .eq('payment_status', 'completed')
      .eq('orders.status', 'paid')
      .order('created_at', { ascending: false })

    // Group by order_id to avoid duplicates
    const orderMap = new Map()
    ;(downloadsData || []).forEach((download: any) => {
      if (!download.order_id || !download.orders) return
      
      const orderId = download.order_id
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          id: download.orders.id,
          order_id: download.orders.id,
          basket_id: download.orders.basket_id,
          area_name: download.areas?.name || 'Unknown',
          area_code: download.areas?.code || '',
          amount: Number(download.orders.total_amount) || 0,
          currency: 'USD',
          status: download.orders.status,
          transaction_id: download.orders.txnid,
          payment_method: 'payfast',
          created_at: download.orders.created_at,
          paid_at: download.orders.updated_at
        })
      }
    })

    setBiddingDocPayments(Array.from(orderMap.values()))

    // Fetch application fee payments (from bid_applications)
    const { data: bidAppsWithPayments } = await supabase
      .from('bid_applications')
      .select(`
        id,
        application_fee_amount,
        application_fee_status,
        payment_method,
        payment_transaction_id,
        bank_name,
        challan_number,
        challan_date,
        payment_paid_at,
        payment_raw_payload,
        created_at,
        areas!inner(
          name,
          code
        )
      `)
      .eq('user_id', user?.id)
      .in('application_fee_status', ['paid', 'verified'])
      .order('created_at', { ascending: false })

    const appFeePayments: ApplicationFeePayment[] = (bidAppsWithPayments || []).map((app: any) => ({
      id: app.id,
      bid_application_id: app.id,
      area_name: app.areas?.name || 'Unknown',
      area_code: app.areas?.code || '',
      amount: Number(app.application_fee_amount) || 100000,
      currency: 'PKR',
      status: app.application_fee_status,
      payment_method: app.payment_method,
      transaction_id: app.payment_transaction_id,
      bank_name: app.bank_name,
      challan_number: app.challan_number,
      challan_date: app.challan_date,
      created_at: app.created_at,
      paid_at: app.payment_paid_at,
      payment_raw_payload: app.payment_raw_payload
    }))
    setApplicationFeePayments(appFeePayments)
  }

  // Legacy function for backward compatibility (used by createTicket)
  const fetchAllData = async () => {
    // Refresh all loaded tabs
    setLoadedTabs(new Set())
    for (const tab of ['opened-bidding', 'purchased-documents', 'submitted-applications', 'support', 'payments'] as PortalTab[]) {
      if (loadedTabs.has(tab)) {
        await fetchTabData(tab)
      }
    }
  }

  const handleDownloadReceipt = async (payment: BiddingDocumentPayment | ApplicationFeePayment, type: 'bidding_blocks' | 'bid_application') => {
    const receiptId = payment.id
    setDownloadingReceipts(prev => new Set(prev).add(receiptId))
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      // Fetch user profile for company name and address
      // Use same approach as BiddingPortalLayout: first check cached userProfile, then fetch from DB
      let companyName: string | undefined
      let address: string | undefined
      
      // First, try to use cached userProfile from useAuth hook
      if (userProfile?.company_name) {
        companyName = userProfile.company_name.trim() || undefined
      }
      if (userProfile?.address) {
        address = userProfile.address.trim() || undefined
      }
      
      // If not available from cache, fetch from database
      if (user?.id && (!companyName || !address)) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('company_name, address')
            .eq('id', user.id)
            .single()
          
          if (!profileError && profile) {
            if (!companyName && profile.company_name) {
              companyName = profile.company_name.trim() || undefined
            }
            if (!address && profile.address) {
              address = profile.address.trim() || undefined
            }
          } else if (profileError) {
            // If query with 'id' fails, try with 'user_id' as fallback
            const { data: profileAlt, error: profileAltError } = await supabase
              .from('user_profiles')
              .select('company_name, address')
              .eq('user_id', user.id)
              .maybeSingle()
            
            if (!profileAltError && profileAlt) {
              if (!companyName && profileAlt.company_name) {
                companyName = profileAlt.company_name.trim() || undefined
              }
              if (!address && profileAlt.address) {
                address = profileAlt.address.trim() || undefined
              }
            }
          }
        } catch (err) {
          console.error('Error fetching user profile:', err)
        }
      }
      
      if (type === 'bidding_blocks') {
        const biddingPayment = payment as BiddingDocumentPayment
        // Fetch order items for this payment
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select(`
            *,
            order_items:order_items(
              area_id,
              quantity,
              unit_price,
              areas:areas(name, code)
            ),
            payments:payments(
              transaction_id,
              amount,
              currency,
              created_at
            )
          `)
          .eq('basket_id', biddingPayment.basket_id)
          .maybeSingle()
        
        if (orderError) {
          console.error('Error fetching order:', orderError)
          throw new Error('Failed to fetch order details')
        }
        
        if (!orderData) {
          // Fallback: use payment data directly if order not found
          const receiptData: PaymentReceiptData = {
            basketId: biddingPayment.basket_id,
            transactionId: biddingPayment.transaction_id || '',
            amount: biddingPayment.amount,
            currency: biddingPayment.currency || 'USD',
            paymentDate: biddingPayment.paid_at || biddingPayment.created_at || new Date().toISOString(),
            paymentMethod: 'PayFast',
            items: [{
              name: biddingPayment.area_name,
              quantity: 1,
              price: biddingPayment.amount
            }],
            customerName: user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0],
            customerEmail: user?.email,
            companyName,
            address,
            type: 'bidding_blocks'
          }
          await generatePaymentReceipt(receiptData)
          return
        }
        
        const paymentRecord = Array.isArray(orderData.payments) 
          ? orderData.payments[0] 
          : orderData.payments
        
        const receiptData: PaymentReceiptData = {
          basketId: biddingPayment.basket_id,
          transactionId: paymentRecord?.transaction_id || biddingPayment.transaction_id || orderData.txnid || '',
          amount: biddingPayment.amount,
          currency: paymentRecord?.currency || biddingPayment.currency || 'USD',
          paymentDate: paymentRecord?.created_at || biddingPayment.paid_at || biddingPayment.created_at || new Date().toISOString(),
          paymentMethod: 'PayFast',
          items: Array.isArray(orderData.order_items)
            ? orderData.order_items.map((item: any) => ({
                name: item.areas?.name || item.areas?.code || `Area ${item.area_id?.substring(0, 8) || 'Unknown'}`,
                quantity: item.quantity || 1,
                price: item.unit_price || 0
              }))
            : [{
                name: biddingPayment.area_name,
                quantity: 1,
                price: biddingPayment.amount
              }],
          customerName: user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0],
          customerEmail: user?.email,
          companyName,
          address,
          type: 'bidding_blocks'
        }
        
        await generatePaymentReceipt(receiptData)
      } else {
        const appPayment = payment as ApplicationFeePayment
        // Extract basket_id from payment_raw_payload if available
        let basketId = appPayment.id.substring(0, 8).toUpperCase() // Default fallback
        if (appPayment.payment_raw_payload) {
          // payment_raw_payload can be an object or a string (JSON)
          let payload: any = appPayment.payment_raw_payload
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload)
            } catch (e) {
              console.error('Error parsing payment_raw_payload:', e)
            }
          }
          if (payload && payload.basket_id) {
            basketId = payload.basket_id
          }
        }
        
        const receiptData: PaymentReceiptData = {
          basketId: basketId,
          transactionId: appPayment.transaction_id || '',
          amount: appPayment.amount,
          currency: appPayment.currency || 'PKR',
          paymentDate: appPayment.paid_at || appPayment.created_at || new Date().toISOString(),
          paymentMethod: appPayment.payment_method === 'online' ? 'PayFast' : 'Bank Challan',
          customerName: user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0],
          customerEmail: user?.email,
          companyName,
          address,
          type: 'bid_application',
          areaName: appPayment.area_name || appPayment.area_code || 'Bid Application'
        }
        
        await generatePaymentReceipt(receiptData)
      }
    } catch (error) {
      console.error('Error generating receipt:', error)
      setError('Failed to generate receipt. Please try again.')
    } finally {
      setDownloadingReceipts(prev => {
        const next = new Set(prev)
        next.delete(receiptId)
        return next
      })
    }
  }

  const handleDownload = async (areaId: string, pdfUrl: string, areaName: string) => {
    try {
      const downloadingKey = `${areaId}_${pdfUrl}`
      setDownloadingAreas(prev => new Set(prev).add(downloadingKey))

      const result = await downloadAreaDocumentByUrl(areaId, pdfUrl)

      if (result.signedUrl) {
        const link = document.createElement('a')
        link.href = result.signedUrl
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        if (result.downloadName) {
          link.download = result.downloadName
        }
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else if (result.blob) {
        let fileName = pdfUrl.split('/').pop() || `${areaName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
        fileName = fileName.split('?')[0]
        if (!fileName.endsWith('.pdf')) fileName = `${fileName}.pdf`
        
        const url = window.URL.createObjectURL(result.blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } else {
        throw new Error('No download data received')
      }

    } catch (error) {
      console.error('Error downloading document:', error)
      alert('Failed to download the document.')
    } finally {
      setDownloadingAreas(prev => {
        const newSet = new Set(prev)
        newSet.delete(`${areaId}_${pdfUrl}`)
        return newSet
      })
    }
  }

  const createTicket = async () => {
    if (!newTicket.subject || !newTicket.description) {
      alert('Please fill in subject and description')
      return
    }

    try {
      setCreatingTicket(true)
      const token = await getAuthToken()

      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newTicket)
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error)
      }

      setNewTicket({ subject: '', description: '', category: 'general' })
      setShowNewTicket(false)
      // Refresh support tab data
      setLoadedTabs(prev => {
        const newSet = new Set(prev)
        newSet.delete('support')
        return newSet
      })
      await fetchTabData('support')
    } catch (error: any) {
      alert(error.message || 'Failed to create ticket')
    } finally {
      setCreatingTicket(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
  }

  const getCountdown = (targetDate: string) => {
    const target = new Date(targetDate)
    const diff = target.getTime() - now.getTime()
    
    if (diff <= 0) return { text: 'NOW OPEN', isOpen: true }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    if (days > 0) return { text: `${days}d ${hours}h ${minutes}m`, isOpen: false }
    if (hours > 0) return { text: `${hours}h ${minutes}m ${seconds}s`, isOpen: false }
    return { text: `${minutes}m ${seconds}s`, isOpen: false }
  }

  const getBidStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      submitted: 'bg-blue-50 text-blue-700',
      under_review: 'bg-amber-50 text-amber-700',
      approved: 'bg-emerald-50 text-emerald-700',
      rejected: 'bg-red-50 text-red-700'
    }
    return <Badge className={styles[status] || 'bg-gray-100'}>{status.replace('_', ' ')}</Badge>
  }

  const getTicketStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-blue-50 text-blue-700',
      in_progress: 'bg-amber-50 text-amber-700',
      awaiting_reply: 'bg-purple-50 text-purple-700',
      resolved: 'bg-emerald-50 text-emerald-700',
      closed: 'bg-gray-100 text-gray-700'
    }
    return <Badge className={styles[status] || 'bg-gray-100'}>{status.replace('_', ' ')}</Badge>
  }

  const getSubtitle = () => {
    switch (activeTab) {
      case 'opened-bidding': return 'Browse and purchase bidding documents for open blocks'
      case 'interactive-map': return 'View open blocks on the interactive GIS map'
      case 'purchased-documents': return 'Download documents and apply for bidding'
      case 'submitted-applications': return 'Track your submitted bids'
      case 'support': return 'Create and manage support tickets'
      case 'payments': return 'View all your payment history'
      default: return ''
    }
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'opened-bidding': return 'Opened Bidding'
      case 'interactive-map': return 'Interactive Map'
      case 'purchased-documents': return 'Purchased Documents'
      case 'submitted-applications': return 'Submitted Bids'
      case 'support': return 'Support Tickets'
      case 'payments': return 'Payments'
      default: return 'Bidding Portal'
    }
  }

  if (loading || portalEnabled === null) {
    return (
      <BiddingPortalLayout activeTab={activeTab} title="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </BiddingPortalLayout>
    )
  }

  // Check if bidding portal is disabled
  if (portalEnabled === false) {
    return (
      <BiddingPortalLayout activeTab={activeTab} title="Bidding Portal Locked">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Bidding Portal is Currently Locked</h2>
              <p className="text-gray-600 mb-6">
                The bidding portal is temporarily unavailable. Please check back later or contact support for assistance.
              </p>
              <Button onClick={() => router.push('/')} className="bg-teal-600 hover:bg-teal-700">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </BiddingPortalLayout>
    )
  }

  const filteredOpenBlocks = openBlocksView === 'open'
    ? openBlocks.filter((b) => !b.isPurchased)
    : openBlocks.filter((b) => b.isPurchased)

  return (
    <BiddingPortalLayout activeTab={activeTab} title={getTitle()} subtitle={getSubtitle()}>
      {error && !error.includes('Unauthorized') && !error.includes('Session expired') && !error.includes('Redirecting') && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Opened Bidding Tab */}
      {activeTab === 'opened-bidding' && (
        tabLoading['opened-bidding'] ? (
          <div className="space-y-4">
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 lg:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="flex items-start space-x-4">
                        <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center space-x-3">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                          </div>
                          <Skeleton className="h-4 w-32" />
                          <div className="flex items-center space-x-4">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-32" />
                          </div>
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <Skeleton className="h-10 w-36" />
                        <Skeleton className="h-10 w-32" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 w-full max-w-full overflow-x-hidden">
          {openBlocks.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <FolderOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Open Bidding Blocks</h3>
                <p className="text-gray-500">There are currently no blocks open for bidding.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 w-full max-w-full">
              {/* Toggle between available and purchased blocks */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">View blocks</p>
                </div>
                <div className="inline-flex items-center rounded-full bg-gray-100 p-1">
                  <button
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                      openBlocksView === 'open' ? 'shadow text-white' : 'text-gray-600'
                    }`}
                    style={openBlocksView === 'open' ? { backgroundColor: '#317070' } : {}}
                    onClick={() => setOpenBlocksView('open')}
                  >
                    Open Blocks ({openBlocks.filter(b => !b.isPurchased).length})
                  </button>
                  <button
                    className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                      openBlocksView === 'purchased' ? 'bg-white shadow text-teal-700' : 'text-gray-600'
                    }`}
                    onClick={() => setOpenBlocksView('purchased')}
                  >
                    Purchased ({openBlocks.filter(b => b.isPurchased).length})
                  </button>
                </div>
              </div>

              {filteredOpenBlocks.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center">
                    <FileStack className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {openBlocksView === 'open' ? 'No open blocks available' : 'No purchased blocks here'}
                    </h3>
                    <p className="text-gray-500">
                      {openBlocksView === 'open'
                        ? 'Check back later for newly opened blocks.'
                        : 'Your purchased blocks will appear here.'}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredOpenBlocks.map((block) => {
                  const brochureHref = getBrochureHref(block.brochure_url)
                  const isPurchased = block.isPurchased
                  const cardClasses = isPurchased
                    ? 'bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200'
                    : 'border border-gray-200'

                  return (
                    <Card key={block.id} className={`hover:shadow-md transition-shadow w-full max-w-full ${cardClasses}`}>
                      <CardContent className="p-4 lg:p-5 w-full max-w-full overflow-x-hidden">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 w-full max-w-full">
                          <div className="flex items-start space-x-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isPurchased ? 'bg-blue-100' : 'bg-teal-50'
                            }`}>
                              {isPurchased ? (
                                <FileCheck className="w-6 h-6 text-blue-700" />
                              ) : (
                                <MapPin className="w-6 h-6 text-teal-600" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center flex-wrap gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-gray-900">{block.name}</h3>
                                <Badge className={isPurchased ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}>
                                  {isPurchased ? 'Purchased' : 'Open'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-500">{block.code}</p>
                              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                                <span>{block.zone_name}</span>
                                <span>•</span>
                                <span>{block.block_name}</span>
                              </div>
                              {block.bid_submission_deadline && (
                                <p className="text-sm text-amber-600 mt-2 flex items-center">
                                  <Clock className="w-4 h-4 mr-1" />
                                  Deadline: {formatDate(block.bid_submission_deadline)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            {isPurchased && block.pdf_url && block.pdf_url.length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(block.id, block.pdf_url![0], block.name)}
                                disabled={downloadingAreas.has(`${block.id}_${block.pdf_url![0]}`)}
                                className="border-teal-200 text-teal-700 hover:bg-teal-50 font-medium"
                              >
                                {downloadingAreas.has(`${block.id}_${block.pdf_url![0]}`) ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Downloading...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-4 h-4 mr-2" />
                                    Bidding Documents
                                  </>
                                )}
                              </Button>
                            )}
                            {brochureHref && (
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                className="border-teal-200 text-teal-700 hover:bg-teal-50 font-medium"
                              >
                                <a
                                  href={brochureHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download Brochure
                                </a>
                              </Button>
                            )}
                            {!isPurchased && (
                              isInCart(block.id) ? (
                                <Button
                                  disabled
                                  className="!bg-gray-400 !text-white cursor-not-allowed"
                                >
                                  <ShoppingCart className="w-4 h-4 mr-2" />
                                  In Cart
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleAddToCart(block)}
                                  className="!bg-teal-600 hover:!bg-teal-700 !text-white"
                                >
                                  <ShoppingCart className="w-4 h-4 mr-2" />
                                  Purchase ({formatPrice(block.price)})
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          )}
          </div>
        )
      )}

      {/* Interactive Map Tab */}
      {activeTab === 'interactive-map' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-xl">
              <InteractiveMapComponent openBlocksOnly={true} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Purchased Documents Tab */}
      {activeTab === 'purchased-documents' && (
        tabLoading['purchased-documents'] ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {purchasedAreas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <FileStack className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Purchased Documents</h3>
                <p className="text-gray-500 mb-6">You haven&apos;t purchased any bidding documents yet.</p>
                <Button onClick={() => router.push('/bidding-portal?tab=opened-bidding')} variant="outline">
                  Browse Open Blocks
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {purchasedAreas
                .filter((area) => {
                  // Only show areas where there's no bid application or status is 'draft'
                  // Exclude submitted, under_review, and approved bids
                  const hasBidApp = area.bid_application
                  const bidStatus = hasBidApp?.status
                  return !hasBidApp || bidStatus === 'draft'
                })
                .map((area) => {
                const hasBidApp = area.bid_application
                const bidStatus = hasBidApp?.status
                const canApply = !hasBidApp || bidStatus === 'draft'
                const brochureHref = getBrochureHref(area.brochure_url)
                
                // Check if submission is closed based on bid_submission_closing_date
                const isSubmissionClosed = bidSubmissionClosingDate 
                  ? new Date() > bidSubmissionClosingDate 
                  : false
                
                  return (
                    <Card key={area.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 lg:p-5">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-3 mb-1">
                              <h3 className="text-lg font-semibold text-gray-900">{area.area_name}</h3>
                              {hasBidApp && getBidStatusBadge(bidStatus!)}
                            </div>
                            <p className="text-sm text-gray-500">{area.area_code}</p>
                            
                            <div className="mt-4 flex flex-wrap gap-2">
                              {area.pdf_url && area.pdf_url.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownload(area.area_id, area.pdf_url![0], area.area_name)}
                                  disabled={downloadingAreas.has(`${area.area_id}_${area.pdf_url![0]}`)}
                                  className="border-teal-200 text-teal-700 hover:bg-teal-50 font-medium"
                                >
                                  {downloadingAreas.has(`${area.area_id}_${area.pdf_url![0]}`) ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      Downloading...
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-4 h-4 mr-2" />
                                      Bidding Documents
                                    </>
                                  )}
                                </Button>
                              )}
                              {brochureHref && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  asChild
                                  className="border-teal-200 text-teal-700 hover:bg-teal-50 font-medium"
                                >
                                  <a
                                    href={brochureHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download Brochure
                                  </a>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="lg:w-48">
                          {canApply ? (
                            isSubmissionClosed ? (
                              <Button
                                disabled
                                className="bg-gray-400 hover:bg-gray-400 text-white w-full cursor-not-allowed"
                              >
                                <Lock className="w-4 h-4 mr-2" />
                                Bid Submission Closed
                              </Button>
                            ) : (
                              <Button
                                onClick={() => router.push(`/bid-submission/${area.area_id}`)}
                                className="bg-teal-600 hover:bg-teal-700 text-white w-full"
                              >
                                <Send className="w-4 h-4 mr-2" />
                                {bidStatus === 'draft' ? 'Resume Application' : 'Submit Bid Application'}
                              </Button>
                            )
                          ) : (
                            <div className="text-center p-3 bg-gray-50 rounded-lg">
                              <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                              <p className="text-sm font-medium text-gray-700">
                                {bidStatus === 'submitted' ? 'Bid Submitted' : bidStatus?.replace('_', ' ').split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
          </div>
        )
      )}

      {/* Submitted Bids Tab */}
      {activeTab === 'submitted-applications' && (
        tabLoading['submitted-applications'] ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {submittedApps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <ClipboardCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Submitted Bids</h3>
                <p className="text-gray-500">You haven&apos;t submitted any bid applications yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {submittedApps.map((app) => (
                <Card key={app.id} className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-emerald-500">
                  <CardContent className="p-4 lg:p-5">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center flex-shrink-0 border border-emerald-200">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <h3 className="text-lg font-semibold text-gray-900">{app.area_name}</h3>
                          {getBidStatusBadge(app.status)}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{app.area_code}</p>
                        
                        {/* Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <div className="flex items-start space-x-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                            <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-500 mb-0.5">Applicant</p>
                              <p className="text-sm font-semibold text-gray-900 truncate">{app.primary_applicant_name}</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
                            <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-gray-500 mb-0.5">Submitted</p>
                              <p className="text-sm font-semibold text-gray-900">{formatDate(app.submitted_at)}</p>
                            </div>
                          </div>
                          {app.work_units && (
                            <div className="flex items-start space-x-2 p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                              <Trophy className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-emerald-700 mb-0.5">Work Units</p>
                                <p className="text-sm font-bold text-emerald-700">{app.work_units}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        )
      )}

      {/* Support Tickets Tab */}
      {activeTab === 'support' && (
        tabLoading['support'] ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* New Ticket Button / Form */}
          {!showNewTicket ? (
            <Button onClick={() => setShowNewTicket(true)} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Create New Ticket
            </Button>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Create Support Ticket</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <Input
                    placeholder="Brief description of your issue"
                    value={newTicket.subject}
                    onChange={(e) => setNewTicket(prev => ({ ...prev, subject: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg"
                    value={newTicket.category}
                    onChange={(e) => setNewTicket(prev => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="general">General</option>
                    <option value="bidding">Bidding</option>
                    <option value="payment">Payment</option>
                    <option value="documents">Documents</option>
                    <option value="work_program">Work Program</option>
                    <option value="technical">Technical</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <Textarea
                    placeholder="Describe your issue in detail..."
                    rows={4}
                    value={newTicket.description}
                    onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <Button variant="outline" onClick={() => setShowNewTicket(false)}>Cancel</Button>
                  <Button onClick={createTicket} disabled={creatingTicket} className="bg-teal-600 hover:bg-teal-700">
                    {creatingTicket ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Submit Ticket
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tickets List */}
          {tickets.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Support Tickets</h3>
                <p className="text-gray-500">Create a ticket if you need assistance.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {tickets.map((ticket) => (
                <Card key={ticket.id} className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => router.push(`/bidding-portal/ticket/${ticket.id}`)}>
                  <CardContent className="p-4 lg:p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 font-mono text-sm">
                          #{ticket.ticket_number}
                        </div>
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            <h3 className="font-semibold text-gray-900">{ticket.subject}</h3>
                            {getTicketStatusBadge(ticket.status)}
                          </div>
                          <p className="text-sm text-gray-500 capitalize">{ticket.category}</p>
                          <p className="text-xs text-gray-400 mt-2">{formatDate(ticket.created_at)}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        )
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        tabLoading['payments'] ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Payment Summary - Moved to Top */}
            {(biddingDocPayments.length > 0 || applicationFeePayments.length > 0) && (
              <Card className="bg-gradient-to-br from-teal-500 via-teal-600 to-teal-700 border-0 shadow-xl">
                <CardContent className="p-6 lg:p-8">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Payment Summary</h2>
                      <p className="text-teal-100 text-sm">Overview of all your transactions</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                      <div className="flex items-center space-x-3 mb-3">
                        <FileText className="w-5 h-5 text-white/80" />
                        <p className="text-sm font-medium text-white/80">Bidding Documents</p>
                      </div>
                      <p className="text-3xl font-bold text-white mb-1">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(biddingDocPayments.reduce((sum, p) => sum + p.amount, 0))}
                      </p>
                      <p className="text-xs text-white/70">{biddingDocPayments.length} payment{biddingDocPayments.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20">
                      <div className="flex items-center space-x-3 mb-3">
                        <CreditCard className="w-5 h-5 text-white/80" />
                        <p className="text-sm font-medium text-white/80">Application Fees</p>
                      </div>
                      <p className="text-3xl font-bold text-white mb-1">
                        {new Intl.NumberFormat('en-PK', {
                          style: 'currency',
                          currency: 'PKR',
                          minimumFractionDigits: 0
                        }).format(applicationFeePayments.reduce((sum, p) => sum + p.amount, 0))}
                      </p>
                      <p className="text-xs text-white/70">{applicationFeePayments.length} payment{applicationFeePayments.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-5 border border-white/30">
                      <div className="flex items-center space-x-3 mb-3">
                        <Receipt className="w-5 h-5 text-white" />
                        <p className="text-sm font-medium text-white">Total Payments</p>
                      </div>
                      <p className="text-3xl font-bold text-white mb-1">
                        {biddingDocPayments.length + applicationFeePayments.length}
                      </p>
                      <p className="text-xs text-white/90">All transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bidding Document Payments */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <FileText className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Bidding Document Payments</h3>
              <Badge className="bg-teal-50 text-teal-700">{biddingDocPayments.length}</Badge>
            </div>
            
            {biddingDocPayments.length === 0 ? (
              <Card className="border-dashed border-gray-200">
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bidding Document Payments</h3>
                  <p className="text-gray-500">You haven&apos;t made any bidding document payments yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {biddingDocPayments.map((payment) => (
                  <Card key={payment.id} className="hover:shadow-lg transition-all duration-200 border border-gray-200">
                    <CardContent className="p-5 lg:p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                        <div className="flex items-start space-x-4 flex-1">
                          <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                            <FileText className="w-7 h-7 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-bold text-gray-900">{payment.area_name}</h3>
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">Paid</Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-4 font-medium">{payment.area_code}</p>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1 font-medium">Amount</p>
                                <p className="text-base font-bold text-gray-900">
                                  {new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: payment.currency
                                  }).format(payment.amount)}
                                </p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1 font-medium">Payment Date</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  {payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)}
                                </p>
                              </div>
                              {payment.transaction_id && (
                                <div className="bg-gray-50 rounded-lg p-3">
                                  <p className="text-xs text-gray-500 mb-1 font-medium">Transaction ID</p>
                                  <p className="text-xs font-mono text-gray-900 break-all">{payment.transaction_id.substring(0, 20)}...</p>
                                </div>
                              )}
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1 font-medium">Order ID</p>
                                <p className="text-xs font-mono text-gray-900">{payment.basket_id}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="lg:flex-shrink-0 flex flex-col items-start lg:items-end gap-3">
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 capitalize font-medium px-3 py-1">
                            {payment.payment_method}
                          </Badge>
                          <Button
                            onClick={() => handleDownloadReceipt(payment, 'bidding_blocks')}
                            disabled={downloadingReceipts.has(payment.id)}
                            variant="outline"
                            size="sm"
                            className="flex items-center space-x-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:border-teal-400"
                          >
                            {downloadingReceipts.has(payment.id) ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Receipt className="w-4 h-4" />
                                <span>Download Receipt</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Application Fee Payments */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <CreditCard className="w-5 h-5 text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Application Fee Payments</h3>
              <Badge className="bg-orange-50 text-orange-700">{applicationFeePayments.length}</Badge>
            </div>
            
            {applicationFeePayments.length === 0 ? (
              <Card className="border-dashed border-gray-200">
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <CreditCard className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Application Fee Payments</h3>
                  <p className="text-gray-500">You haven&apos;t made any application fee payments yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {applicationFeePayments.map((payment) => (
                  <Card key={payment.id} className="hover:shadow-lg transition-all duration-200 border border-gray-200">
                    <CardContent className="p-5 lg:p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                        <div className="flex items-start space-x-4 flex-1">
                          <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                            <CreditCard className="w-7 h-7 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-bold text-gray-900">{payment.area_name}</h3>
                              <Badge className={
                                payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                                payment.status === 'verified' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                              }>
                                {payment.status === 'verified' ? 'Verified' : 'Paid'}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-4 font-medium">{payment.area_code}</p>
                            {(() => {
                              // Extract basket_id from payment_raw_payload
                              let orderId: string | null = null
                              if (payment.payment_raw_payload) {
                                let payload: any = payment.payment_raw_payload
                                if (typeof payload === 'string') {
                                  try {
                                    payload = JSON.parse(payload)
                                  } catch (e) {
                                    // Ignore parse errors
                                  }
                                }
                                if (payload && payload.basket_id) {
                                  orderId = payload.basket_id
                                }
                              }
                              return (
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1 font-medium">Amount</p>
                                    <p className="text-base font-bold text-gray-900">
                                  {new Intl.NumberFormat('en-PK', {
                                    style: 'currency',
                                    currency: payment.currency,
                                    minimumFractionDigits: 0
                                  }).format(payment.amount)}
                                </p>
                              </div>
                                  <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1 font-medium">Payment Date</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                  {payment.paid_at ? formatDate(payment.paid_at) : formatDate(payment.created_at)}
                                </p>
                              </div>
                              {payment.payment_method === 'online' && payment.transaction_id && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <p className="text-xs text-gray-500 mb-1 font-medium">Transaction ID</p>
                                      <p className="text-xs font-mono text-gray-900 break-all">{payment.transaction_id.substring(0, 20)}...</p>
                                    </div>
                                  )}
                                  {payment.payment_method === 'online' && orderId && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <p className="text-xs text-gray-500 mb-1 font-medium">Order ID</p>
                                      <p className="text-xs font-mono text-gray-900">{orderId}</p>
                                </div>
                              )}
                              {payment.payment_method === 'bank_challan' && (
                                <>
                                  {payment.bank_name && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <p className="text-xs text-gray-500 mb-1 font-medium">Bank</p>
                                      <p className="text-sm font-semibold text-gray-900">{payment.bank_name}</p>
                                    </div>
                                  )}
                                  {payment.challan_number && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <p className="text-xs text-gray-500 mb-1 font-medium">Challan Number</p>
                                      <p className="text-sm font-semibold text-gray-900">{payment.challan_number}</p>
                                    </div>
                                  )}
                                  {payment.challan_date && (
                                    <div className="bg-gray-50 rounded-lg p-3">
                                      <p className="text-xs text-gray-500 mb-1 font-medium">Challan Date</p>
                                      <p className="text-sm font-semibold text-gray-900">
                                        {new Date(payment.challan_date).toLocaleDateString('en-US', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric'
                                        })}
                                      </p>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                              )
                            })()}
                          </div>
                        </div>
                        <div className="lg:flex-shrink-0 flex flex-col items-start lg:items-end gap-3">
                          <Badge className={
                            payment.payment_method === 'online' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            payment.payment_method === 'bank_challan' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }>
                            {payment.payment_method === 'online' ? 'Online' :
                             payment.payment_method === 'bank_challan' ? 'Bank Challan' :
                             'Unknown'}
                          </Badge>
                          {payment.payment_method === 'online' && payment.transaction_id && (
                            <Button
                              onClick={() => handleDownloadReceipt(payment, 'bid_application')}
                              disabled={downloadingReceipts.has(payment.id)}
                              variant="outline"
                              size="sm"
                              className="flex items-center space-x-2 border-teal-300 text-teal-700 hover:bg-teal-50 hover:border-teal-400"
                            >
                              {downloadingReceipts.has(payment.id) ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span>Generating...</span>
                                </>
                              ) : (
                                <>
                                  <Receipt className="w-4 h-4" />
                                  <span>Download Receipt</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          </div>
        )
      )}

      {/* Cart Button - Only show on opened-bidding tab */}
      {activeTab === 'opened-bidding' && user && getTotalItems() > 0 && (
        <div
          className="fixed top-1/2 right-0 z-50"
          style={{ transform: 'translateY(-50%)' }}
          onMouseEnter={() => {
            setCartHovered(true)
            setCartExpanded(true)
          }}
          onMouseLeave={() => {
            setCartHovered(false)
            setCartExpanded(false)
          }}
        >
          <button
            onClick={() => setCartModalOpen(true)}
            className={`
              floating-button group flex items-center justify-center
              text-white font-semibold
              shadow-lg hover:shadow-xl
              relative animate-cart-ripple animate-cart-pulse
              h-14 rounded-l-xl
              ${cartExpanded ? 'expanded' : ''}
            `}
            aria-label="Shopping Cart"
            style={{ 
              backgroundColor: cartHovered ? '#f5a623' : '#feb52f',
              backgroundImage: 'none'
            }}
          >
            <div className="flex items-center justify-center flex-shrink-0 relative">
              <ShoppingCart className="w-6 h-6" />
              {getTotalItems() > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold animate-pulse">
                  {getTotalItems()}
                </span>
              )}
            </div>
            <div className="floating-button-text">
              <span className="text-sm lg:text-base font-semibold">
                Cart ({getTotalItems()})
              </span>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal */}
      {cartModalOpen && (
        <Suspense fallback={null}>
          <CartModal
            isOpen={cartModalOpen}
            onClose={() => setCartModalOpen(false)}
            onPaymentSuccess={() => {
              setCartModalOpen(false)
              // Refresh purchased documents after payment
              if (activeTab === 'purchased-documents') {
                fetchPurchasedDocumentsData()
              }
            }}
          />
        </Suspense>
      )}
    </BiddingPortalLayout>
  )
}

export default function BiddingPortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    }>
      <BiddingPortalContent />
    </Suspense>
  )
}
