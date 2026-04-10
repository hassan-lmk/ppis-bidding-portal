'use client'

import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getBiddingPortalStatus } from '../lib/bidding-portal-cache'
import { biddingPortalQueryKeys } from '../lib/bidding-portal-query-keys'
import {
  fetchOpenedBiddingBlocks,
  fetchPurchasedDocumentsTab,
  fetchSubmittedApplications,
  fetchSupportTickets,
  fetchPaymentsTab,
  fetchPortalProfile,
} from '../lib/bidding-portal-tab-fetchers'
import type {
  OpenBlock,
  PurchasedArea,
  SubmittedApplication,
  Ticket,
  BiddingDocumentPayment,
  ApplicationFeePayment,
  PortalProfileData,
} from '../lib/bidding-portal-tab-fetchers'
import { downloadAreaDocumentByUrl, Area } from '../lib/bidding-api'
import { getBrochureHref } from '../lib/brochure'
import { useCart } from '../lib/cart-context'
import BiddingPortalLayout, { PortalTab } from '../components/BiddingPortalLayout'
import { generatePaymentReceipt, PaymentReceiptData } from '../lib/receipt-generator'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Skeleton } from '../components/ui/skeleton'
import PasswordRequirements from '../components/PasswordRequirements'
import { passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'
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

export function BiddingPortalApp({ activeTab }: { activeTab: PortalTab }) {
  const searchParams = useSearchParams()
  const [selectedOpenedBlockId, setSelectedOpenedBlockId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [downloadingAreas, setDownloadingAreas] = useState<Set<string>>(new Set())
  const [downloadingReceipts, setDownloadingReceipts] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(new Date())
  
  // Ticket creation
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({ subject: '', description: '', category: 'general' })
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)
  const [passwordCardOpen, setPasswordCardOpen] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  
  // Cart state
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [cartExpanded, setCartExpanded] = useState(false)
  const [cartHovered, setCartHovered] = useState(false)
  
  const { user, loading: authLoading, session, userProfile } = useAuth()
  const { addToCart, removeFromCart, isInCart, getTotalItems, getTotalPrice, items } = useCart()
  const router = useRouter()
  const queryClient = useQueryClient()
  const userId = user?.id ?? ''

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

  // Open cart after redirect from public map (PayFast checkout flow)
  useEffect(() => {
    if (searchParams.get('openCart') === '1') {
      setCartModalOpen(true)
    }
  }, [searchParams])

  // Update current time every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const portalStatusQuery = useQuery({
    queryKey: biddingPortalQueryKeys.portalStatus(),
    queryFn: getBiddingPortalStatus,
    staleTime: 60_000,
  })
  const portalEnabled = portalStatusQuery.isPending ? null : (portalStatusQuery.data ?? true)
  const tabEnabledBase = !!userId && portalEnabled === true

  const openedQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('opened-bidding', userId),
    queryFn: () => fetchOpenedBiddingBlocks(userId),
    enabled: tabEnabledBase && activeTab === 'opened-bidding',
    staleTime: 60_000,
  })

  const purchasedQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('purchased-documents', userId),
    queryFn: () => fetchPurchasedDocumentsTab(userId, getAuthToken),
    enabled: tabEnabledBase && activeTab === 'purchased-documents',
    staleTime: 60_000,
  })

  const submittedQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('submitted-applications', userId),
    queryFn: () => fetchSubmittedApplications(userId),
    enabled: tabEnabledBase && activeTab === 'submitted-applications',
    staleTime: 60_000,
  })

  const supportQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('support', userId),
    queryFn: async () => {
      try {
        return await fetchSupportTickets(getAuthToken)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'Unauthorized') {
          handleApiError(null, new Response(null, { status: 401 }))
        }
        throw e
      }
    },
    enabled: tabEnabledBase && activeTab === 'support',
    staleTime: 60_000,
  })

  const paymentsQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('payments', userId),
    queryFn: () => fetchPaymentsTab(userId),
    enabled: tabEnabledBase && activeTab === 'payments',
    staleTime: 60_000,
  })

  const profileQuery = useQuery({
    queryKey: biddingPortalQueryKeys.tab('profile', userId),
    queryFn: () => fetchPortalProfile(userId),
    enabled: tabEnabledBase && activeTab === 'profile',
    staleTime: 60_000,
  })

  const openBlocks = openedQuery.data ?? []
  const purchasedAreas = purchasedQuery.data?.purchasedAreas ?? []
  const bidSubmissionClosingDate = purchasedQuery.data?.closingDate ?? null
  const submittedApps = submittedQuery.data ?? []
  const tickets = supportQuery.data ?? []
  const biddingDocPayments = paymentsQuery.data?.biddingDocPayments ?? []
  const applicationFeePayments = paymentsQuery.data?.applicationFeePayments ?? []
  const profileData = profileQuery.data ?? null

  const tabLoading: Record<PortalTab, boolean> = {
    'opened-bidding': openedQuery.isPending && activeTab === 'opened-bidding',
    'purchased-documents': purchasedQuery.isPending && activeTab === 'purchased-documents',
    'submitted-applications': submittedQuery.isPending && activeTab === 'submitted-applications',
    'support': supportQuery.isPending && activeTab === 'support',
    'payments': paymentsQuery.isPending && activeTab === 'payments',
    'profile': profileQuery.isPending && activeTab === 'profile',
    'interactive-map': false,
    'bid-submission': false,
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/bidding-portal')
    }
  }, [user, authLoading, router])

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordStatus(null)

    if (!passwordMeetsPolicy(newPassword)) {
      setPasswordStatus({ type: 'error', text: passwordPolicyErrorMessage() })
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', text: 'Confirm password does not match.' })
      return
    }

    setUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPasswordStatus({ type: 'ok', text: 'Password updated successfully.' })
      setNewPassword('')
      setConfirmPassword('')
      setPasswordCardOpen(false)
    } catch (err: any) {
      setPasswordStatus({ type: 'error', text: err?.message || 'Failed to update password.' })
    } finally {
      setUpdatingPassword(false)
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
        const fileFromUrl = (pdfUrl.split('/').pop() || '').split('?')[0]
        const fileExtMatch = fileFromUrl.match(/\.([a-zA-Z0-9]{1,10})$/)
        const ext = fileExtMatch ? fileExtMatch[1] : 'pdf'
        const safeAreaBase = (areaName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document')
        const fileName = fileFromUrl && fileExtMatch
          ? fileFromUrl.replace(/[^a-zA-Z0-9._-]/g, '_')
          : `${safeAreaBase}.${ext}`
        
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
      if (userId) {
        await queryClient.invalidateQueries({ queryKey: biddingPortalQueryKeys.tab('support', userId) })
        await queryClient.invalidateQueries({ queryKey: biddingPortalQueryKeys.sidebarCounts(userId) })
      }
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

  const getBasketIdFromRawPayload = (rawPayload: any): string | null => {
    if (!rawPayload) return null
    let payload = rawPayload
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        return null
      }
    }
    return payload?.basket_id || null
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
      case 'profile': return 'Manage your organization information and account security'
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
      case 'profile': return 'Profile'
      default: return 'Bidding Portal'
    }
  }

  if (authLoading || (user != null && portalEnabled === null)) {
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

  const filteredOpenBlocks = openBlocks.filter((b) => !b.isPurchased)

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
              <div className="grid gap-4 lg:grid-cols-12">
                <Card className="lg:col-span-4 overflow-hidden">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Opened Bidding</CardTitle>
                    <p className="text-xs text-gray-500">Open blocks ({filteredOpenBlocks.length})</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3 max-h-[calc(100vh-14rem)] min-h-[320px] overflow-y-auto pr-1">
                      {filteredOpenBlocks.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
                          No open blocks available.
                        </div>
                      ) : (
                        filteredOpenBlocks.map((block) => {
                          const brochureHref = getBrochureHref(block.brochure_url)
                          const isPurchased = block.isPurchased
                          return (
                            <div
                              key={block.id}
                              className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                                selectedOpenedBlockId === block.id
                                  ? 'border-emerald-500 bg-emerald-50'
                                  : 'border-gray-200'
                              }`}
                              onClick={() => setSelectedOpenedBlockId(block.id)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-sm text-gray-900">{block.name}</p>
                                  <p className="text-xs text-gray-500">{block.code}</p>
                                </div>
                                <Badge className={isPurchased ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}>
                                  {isPurchased ? 'Purchased' : 'Open'}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600 mt-2">{block.zone_name} • {block.block_name}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {brochureHref && (
                                  <Button size="sm" variant="outline" asChild className="h-8 text-xs border-teal-200 text-teal-700 hover:bg-teal-50">
                                    <a href={brochureHref} target="_blank" rel="noopener noreferrer">
                                      <Download className="w-3.5 h-3.5 mr-1" />
                                      Brochure
                                    </a>
                                  </Button>
                                )}
                                {!isPurchased && (
                                  isInCart(block.id) ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => removeFromCart(block.id)}
                                      className="h-8 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                    >
                                      Remove from Cart
                                    </Button>
                                  ) : (
                                    <Button size="sm" onClick={() => handleAddToCart(block)} className="h-8 text-xs !bg-teal-600 hover:!bg-teal-700 !text-white">
                                      <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                                      Add ({formatPrice(block.price)})
                                    </Button>
                                  )
                                )}
                                {isPurchased && block.pdf_url && block.pdf_url.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDownload(block.id, block.pdf_url![0], block.name)}
                                    disabled={downloadingAreas.has(`${block.id}_${block.pdf_url![0]}`)}
                                    className="h-8 text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                                  >
                                    {downloadingAreas.has(`${block.id}_${block.pdf_url![0]}`) ? 'Downloading...' : 'Documents'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="lg:col-span-8 space-y-4 lg:h-[calc(100vh-14rem)] flex flex-col">
                  <Card className="flex-1 min-h-0">
                    <CardContent className="p-0 overflow-hidden rounded-xl h-full">
                      <InteractiveMapComponent
                        openBlocksOnly={true}
                        variant="split"
                        selectedAreaId={selectedOpenedBlockId}
                        onAreaSelect={(areaId) => setSelectedOpenedBlockId(areaId)}
                        hideDetailsPanel
                      />
                    </CardContent>
                  </Card>

                  <Card className="border border-teal-200 bg-gradient-to-r from-teal-700 to-teal-600 text-white">
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-wide text-white/85">Cart Summary</p>
                        <p className="text-sm text-white/90 mt-1">
                          {getTotalItems()} item(s)
                          {items.length > 0 ? ` (${items.map(i => i.area.code).join(', ')})` : ''}
                        </p>
                        <p className="text-lg font-bold mt-1">Total: {formatPrice(getTotalPrice())}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setCartModalOpen(true)}
                          disabled={getTotalItems() === 0}
                          className="bg-white text-teal-800 hover:bg-white/90 disabled:opacity-50"
                        >
                          Proceed to Checkout
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
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
                <Button onClick={() => router.push('/bidding-portal/opened-bidding')} variant="outline">
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
      {activeTab === 'profile' && (
        tabLoading['profile'] ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="border-0 text-white overflow-hidden bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 shadow-xl">
              <CardContent className="p-6 md:p-8">
                <p className="text-white/80 text-sm uppercase tracking-wide font-semibold">My Account</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-2">
                  {profileData?.company_name || 'Profile Details'}
                </h1>
                <p className="text-white/85 mt-2 text-sm md:text-base">
                  Manage your organization information and account security settings.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-gray-200">
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Your current profile information.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Company Name</p>
                    <div className="text-gray-900 font-medium">{profileData?.company_name || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Email</p>
                    <div className="text-gray-900 font-medium">{user?.email || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">POC Contact Number</p>
                    <div className="text-gray-900 font-medium">{profileData?.poc_contact_number || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Address</p>
                    <div className="text-gray-900 font-medium">{profileData?.address || '-'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-gray-200">
              <CardHeader>
                <button
                  type="button"
                  onClick={() => setPasswordCardOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <CardTitle>Change Password</CardTitle>
                  <ChevronRight className={`w-5 h-5 text-gray-500 transition-transform ${passwordCardOpen ? 'rotate-90' : ''}`} />
                </button>
                <CardDescription>Use a strong password to secure your account.</CardDescription>
              </CardHeader>
              {passwordCardOpen && (
                <CardContent>
                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                      required
                    />
                    <PasswordRequirements password={newPassword} />
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      required
                    />
                    {passwordStatus && (
                      <p className={passwordStatus.type === 'ok' ? 'text-emerald-700 text-sm' : 'text-red-700 text-sm'}>
                        {passwordStatus.text}
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={updatingPassword}
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                    >
                      {updatingPassword ? 'Updating...' : 'Update Password'}
                    </Button>
                  </form>
                </CardContent>
              )}
            </Card>
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
            {/* Compact Payment Summary */}
            {(biddingDocPayments.length > 0 || applicationFeePayments.length > 0) && (
              <Card className="border border-teal-100 bg-gradient-to-r from-teal-600 to-teal-700 text-white">
                <CardContent className="p-4 md:p-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg bg-white/10 px-4 py-3 border border-white/20">
                      <p className="text-xs uppercase tracking-wide text-white/75">Bidding Documents</p>
                      <p className="text-xl font-bold mt-1">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                          biddingDocPayments.reduce((sum, p) => sum + p.amount, 0)
                        )}
                      </p>
                      <p className="text-xs text-white/80 mt-0.5">{biddingDocPayments.length} payments</p>
                    </div>
                    <div className="rounded-lg bg-white/10 px-4 py-3 border border-white/20">
                      <p className="text-xs uppercase tracking-wide text-white/75">Application Fees</p>
                      <p className="text-xl font-bold mt-1">
                        {new Intl.NumberFormat('en-PK', {
                          style: 'currency',
                          currency: 'PKR',
                          minimumFractionDigits: 0
                        }).format(applicationFeePayments.reduce((sum, p) => sum + p.amount, 0))}
                      </p>
                      <p className="text-xs text-white/80 mt-0.5">{applicationFeePayments.length} payments</p>
                    </div>
                    <div className="rounded-lg bg-white/20 px-4 py-3 border border-white/30">
                      <p className="text-xs uppercase tracking-wide text-white/85">Total Transactions</p>
                      <p className="text-xl font-bold mt-1">{biddingDocPayments.length + applicationFeePayments.length}</p>
                      <p className="text-xs text-white/90 mt-0.5">All payment records</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bidding Document Payments */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <CardTitle className="text-lg">Bidding Document Payments</CardTitle>
                  <Badge className="bg-teal-50 text-teal-700">{biddingDocPayments.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {biddingDocPayments.length === 0 ? (
                  <p className="text-gray-500 text-sm">You haven&apos;t made any bidding document payments yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Area</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Order ID</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Transaction ID</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Method</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Date</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-700">Amount</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-700">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {biddingDocPayments.map((payment) => (
                          <tr key={payment.id} className="border-b last:border-b-0 hover:bg-gray-50/70">
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900">{payment.area_name}</div>
                              <div className="text-xs text-gray-500">{payment.area_code}</div>
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-gray-700">{payment.basket_id}</td>
                            <td className="px-3 py-3 font-mono text-xs text-gray-700">
                              {payment.transaction_id ? `${payment.transaction_id.slice(0, 20)}...` : '-'}
                            </td>
                            <td className="px-3 py-3">
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200 capitalize">
                                {payment.payment_method}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-gray-700">
                              {formatDate(payment.paid_at || payment.created_at)}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: payment.currency
                              }).format(payment.amount)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <Button
                                onClick={() => handleDownloadReceipt(payment, 'bidding_blocks')}
                                disabled={downloadingReceipts.has(payment.id)}
                                variant="outline"
                                size="sm"
                                className="border-teal-300 text-teal-700 hover:bg-teal-50 hover:border-teal-400"
                              >
                                {downloadingReceipts.has(payment.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Receipt className="w-4 h-4" />
                                )}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Application Fee Payments */}
            <Card className="border border-gray-200">
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-gray-600" />
                  <CardTitle className="text-lg">Application Fee Payments</CardTitle>
                  <Badge className="bg-orange-50 text-orange-700">{applicationFeePayments.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {applicationFeePayments.length === 0 ? (
                  <p className="text-gray-500 text-sm">You haven&apos;t made any application fee payments yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Area</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Status</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Method</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Transaction / Order</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Bank / Challan</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-700">Date</th>
                          <th className="text-right px-3 py-2 font-semibold text-gray-700">Amount</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-700">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {applicationFeePayments.map((payment) => {
                          const orderId = getBasketIdFromRawPayload(payment.payment_raw_payload)
                          const paymentMethodLabel =
                            payment.payment_method === 'online'
                              ? 'Online'
                              : payment.payment_method === 'bank_challan'
                              ? 'Bank Challan'
                              : 'Unknown'
                          const paymentStatusLabel = payment.status === 'verified' ? 'Verified' : 'Paid'

                          return (
                            <tr key={payment.id} className="border-b last:border-b-0 hover:bg-gray-50/70">
                              <td className="px-3 py-3">
                                <div className="font-medium text-gray-900">{payment.area_name}</div>
                                <div className="text-xs text-gray-500">{payment.area_code}</div>
                              </td>
                              <td className="px-3 py-3">
                                <Badge
                                  className={
                                    payment.status === 'verified'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                  }
                                >
                                  {paymentStatusLabel}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <Badge
                                  className={
                                    payment.payment_method === 'online'
                                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                                      : payment.payment_method === 'bank_challan'
                                      ? 'bg-purple-100 text-purple-700 border-purple-200'
                                      : 'bg-gray-100 text-gray-700 border-gray-200'
                                  }
                                >
                                  {paymentMethodLabel}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 font-mono text-xs text-gray-700">
                                {payment.transaction_id ? `${payment.transaction_id.slice(0, 20)}...` : '-'}
                                {orderId ? <div className="mt-1">Order: {orderId}</div> : null}
                              </td>
                              <td className="px-3 py-3 text-xs text-gray-700">
                                {payment.payment_method === 'bank_challan' ? (
                                  <div className="space-y-1">
                                    <div>{payment.bank_name || '-'}</div>
                                    <div>{payment.challan_number || '-'}</div>
                                    <div>
                                      {payment.challan_date
                                        ? new Date(payment.challan_date).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                          })
                                        : '-'}
                                    </div>
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-3 py-3 text-gray-700">
                                {formatDate(payment.paid_at || payment.created_at)}
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-gray-900">
                                {new Intl.NumberFormat('en-PK', {
                                  style: 'currency',
                                  currency: payment.currency,
                                  minimumFractionDigits: 0
                                }).format(payment.amount)}
                              </td>
                              <td className="px-3 py-3 text-center">
                                {payment.payment_method === 'online' && payment.transaction_id ? (
                                  <Button
                                    onClick={() => handleDownloadReceipt(payment, 'bid_application')}
                                    disabled={downloadingReceipts.has(payment.id)}
                                    variant="outline"
                                    size="sm"
                                    className="border-teal-300 text-teal-700 hover:bg-teal-50 hover:border-teal-400"
                                  >
                                    {downloadingReceipts.has(payment.id) ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Receipt className="w-4 h-4" />
                                    )}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )
      )}

      {/* Cart Modal */}
      {cartModalOpen && (
        <Suspense fallback={null}>
          <CartModal
            isOpen={cartModalOpen}
            onClose={() => setCartModalOpen(false)}
            onPaymentSuccess={() => {
              setCartModalOpen(false)
              if (userId) {
                void queryClient.invalidateQueries({ queryKey: biddingPortalQueryKeys.tab('purchased-documents', userId) })
                void queryClient.invalidateQueries({ queryKey: biddingPortalQueryKeys.tab('opened-bidding', userId) })
                void queryClient.invalidateQueries({ queryKey: biddingPortalQueryKeys.sidebarCounts(userId) })
              }
            }}
          />
        </Suspense>
      )}
    </BiddingPortalLayout>
  )
}
