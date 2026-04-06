'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { 
  Building2, Home, LogOut, User, Menu, X, FolderOpen, FileStack, 
  ClipboardCheck, Map as MapIcon, MessageSquare, Loader2, ChevronLeft, CreditCard, Send
} from 'lucide-react'
import Image from 'next/image'
import BiddingPortalNewsTicker from './BiddingPortalNewsTicker'
import OnboardingGuard from './OnboardingGuard'

export type PortalTab = 
  | 'opened-bidding' 
  | 'purchased-documents' 
  | 'submitted-applications'
  | 'interactive-map'
  | 'support'
  | 'payments'
  | 'bid-submission'
  | 'submit-bids'

interface SidebarItem {
  id: PortalTab
  label: string
  icon: any
  href?: string
  count?: number
}

interface BiddingPortalLayoutProps {
  children: React.ReactNode
  activeTab: PortalTab
  title: string
  subtitle?: string
  showBackButton?: boolean
  backHref?: string
  backLabel?: string
}

export default function BiddingPortalLayout({
  children,
  activeTab,
  title,
  subtitle,
  showBackButton,
  backHref = '/bidding-portal',
  backLabel = 'Back to Portal'
}: BiddingPortalLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [counts, setCounts] = useState({
    openBlocks: 0,
    purchased: 0,
    submitted: 0,
    tickets: 0,
    payments: 0
  })
  const { user, loading: authLoading, signOut, userProfile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [portalEnabled, setPortalEnabled] = useState<boolean | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)

  // Check if bidding portal is enabled - using cached status
  useEffect(() => {
    let isMounted = true
    
    const checkPortalStatus = async () => {
      try {
        const { getBiddingPortalStatus } = await import('../lib/bidding-portal-cache')
        const enabled = await getBiddingPortalStatus()
        
        if (isMounted) {
          setPortalEnabled(enabled)
        }
      } catch (err) {
        console.error('Error checking portal status:', err)
        if (isMounted) {
        setPortalEnabled(true) // Default to enabled if check fails
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
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      fetchCounts()
      fetchCompanyName()
    }
  }, [user])

  const fetchCompanyName = async () => {
    if (!user) return
    
    // Use cached userProfile if available
    if (userProfile?.company_name) {
      setCompanyName(userProfile.company_name)
      return
    }

    // Otherwise fetch from database
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('company_name')
        .eq('id', user.id)
        .single()
      
      if (!error && data?.company_name) {
        setCompanyName(data.company_name)
      }
    } catch (err) {
      console.error('Error fetching company name:', err)
    }
  }

  const fetchCounts = async () => {
    const userId = user?.id
    if (!userId) return

    try {
      const [
        { count: openCount },
        { data: purchasedData },
        { count: submittedCount },
        { count: ticketsCount },
        { count: paymentsCount },
      ] = await Promise.all([
        supabase
          .from('areas')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'Open'),
        supabase
          .from('area_downloads')
          .select('area_id')
          .eq('user_id', userId)
          .eq('payment_status', 'completed'),
        supabase
          .from('bid_applications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('status', ['submitted', 'under_review', 'approved']),
        supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .neq('status', 'closed'),
        supabase
          .from('bid_applications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('application_fee_status', ['paid', 'verified']),
      ])

      let availableForSubmissionCount = 0
      if (purchasedData && purchasedData.length > 0) {
        const purchasedAreaIds = purchasedData.map((d: any) => d.area_id)
        const { data: bidApps } = await supabase
          .from('bid_applications')
          .select('area_id, status')
          .eq('user_id', userId)
          .in('area_id', purchasedAreaIds)

        const areaBidStatusMap: Record<string, string> = {}
        if (bidApps) {
          bidApps.forEach((app: any) => {
            areaBidStatusMap[app.area_id] = app.status
          })
        }

        availableForSubmissionCount = purchasedAreaIds.filter((areaId: string) => {
          const bidStatus = areaBidStatusMap[areaId]
          return !bidStatus || bidStatus === 'draft'
        }).length
      }

      setCounts({
        openBlocks: openCount || 0,
        purchased: availableForSubmissionCount,
        submitted: submittedCount || 0,
        tickets: ticketsCount || 0,
        payments: paymentsCount || 0,
      })
    } catch (err) {
      console.error('Error fetching counts:', err)
    }
  }

  const sidebarItems: SidebarItem[] = [
    { 
      id: 'opened-bidding', 
      label: 'Opened Bidding', 
      icon: FolderOpen,
      href: '/bidding-portal?tab=opened-bidding',
      count: counts.openBlocks
    },
    { 
      id: 'submit-bids', 
      label: 'Submit Bids', 
      icon: Send,
      href: '/bidding-portal?tab=purchased-documents',
      count: counts.purchased
    },
    { 
      id: 'submitted-applications', 
      label: 'Submitted Bids', 
      icon: ClipboardCheck,
      href: '/bidding-portal?tab=submitted-applications',
      count: counts.submitted
    },
    { 
      id: 'interactive-map', 
      label: 'Interactive Map', 
      icon: MapIcon,
      href: '/bidding-portal?tab=interactive-map'
    },
    { 
      id: 'payments', 
      label: 'Payments', 
      icon: CreditCard,
      href: '/bidding-portal?tab=payments'
    },
    { 
      id: 'support', 
      label: 'Support Tickets', 
      icon: MessageSquare,
      href: '/bidding-portal?tab=support',
      count: counts.tickets
    },
  ]

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex w-full overflow-x-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 lg:w-72
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Outer container with background color and rounded corners */}
        <div className="h-full bg-[#317070] rounded-2xl m-3 px-3 lg:px-3 py-4 lg:py-6 flex flex-col">
          {/* Logo on colored background */}
          <div className="mb-4 lg:mb-6">
            <Link href="/bidding-portal" className="flex items-center justify-center mb-3 lg:mb-4">
              <Image
                src="/images/Logo-white.svg"
                alt="PPIS Logo"
                width={120}
                height={38}
                className="h-8 lg:h-10 w-auto"
              />
            </Link>
            <div className="text-center">
              <h1 className="text-sm lg:text-base font-bold text-white">Bidding Portal</h1>
              <p className="text-[10px] lg:text-xs text-white/80">PPIS Pakistan</p>
            </div>
          </div>

          {/* Inner content area (no background, transparent) */}
          <div className="flex flex-col flex-1 rounded-xl py-3 lg:py-4 px-0 overflow-hidden">
            {/* Close button for mobile */}
            <div className="flex justify-end mb-4 lg:hidden">
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto">
            {sidebarItems.map((item) => {
              const Icon = item.icon
              // Make "Submit Bids" active when on purchased-documents tab
              const isActive = item.id === 'submit-bids' 
                ? activeTab === 'purchased-documents' || activeTab === 'submit-bids'
                : activeTab === item.id
              return (
                <Link
                  key={item.id}
                  href={item.href || '/bidding-portal'}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    w-full flex items-center justify-between px-2 lg:px-2.5 py-1.5 lg:py-2 rounded-lg text-left
                    transition-all duration-200
                    ${isActive 
                      ? 'bg-white/20 text-white border border-white/30' 
                      : 'text-white/80 hover:bg-white/10 hover:text-white border border-transparent'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2 lg:space-x-2.5 min-w-0 flex-1">
                    <Icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-white/60'}`} />
                    <span className="font-medium text-xs lg:text-sm truncate">{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className={`
                      px-1 lg:px-1.5 py-0.5 rounded-full text-[10px] lg:text-xs font-semibold flex-shrink-0 ml-2
                      ${isActive ? 'bg-white/30 text-white' : 'bg-white/20 text-white/90'}
                    `}>
                      {item.count}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

            {/* User & Actions */}
            <div className="pt-3 lg:pt-4 mt-3 lg:mt-4 border-t border-white/20 space-y-1.5 lg:space-y-2">
            {user && (
              <div className="px-2 lg:px-2.5 py-1.5 lg:py-2 bg-white/10 rounded-lg">
                <div className="flex items-center space-x-2 lg:space-x-2.5">
                  <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] lg:text-xs font-medium text-white truncate">
                      {companyName || userProfile?.company_name || 'Company Name'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <a
              href={process.env.NEXT_PUBLIC_MAIN_SITE_URL || 'https://ppisonline.com'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 lg:space-x-2.5 px-2 lg:px-2.5 py-1.5 lg:py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Home className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
              <span className="font-medium text-xs lg:text-sm truncate">Return to Website</span>
            </a>
            <button
              onClick={async () => {
                try {
                  const { error } = await signOut()
                  if (error) {
                    console.error('Sign out error:', error)
                  }
                  // Small delay to ensure signOut completes and storage is cleared
                  await new Promise(resolve => setTimeout(resolve, 100))
                  // Redirect to home page after sign out
                  window.location.href = '/'
                } catch (err) {
                  console.error('Unexpected error during sign out:', err)
                  // Still proceed with redirect after a brief delay
                  await new Promise(resolve => setTimeout(resolve, 100))
                  window.location.href = '/'
                }
              }}
              className="w-full flex items-center space-x-2 lg:space-x-2.5 px-2 lg:px-2.5 py-1.5 lg:py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0" />
              <span className="font-medium text-xs lg:text-sm truncate">Sign Out</span>
            </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 min-h-screen w-full overflow-x-hidden">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              {showBackButton && (
                <Link
                  href={backHref}
                  className="flex items-center space-x-2 text-gray-500 hover:text-gray-700"
                >
                  <ChevronLeft className="w-5 h-5" />
                  <span className="text-sm font-medium">{backLabel}</span>
                </Link>
              )}
              
              <div>
                <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
              </div>
            </div>
          </div>
        </header>

        {/* News Ticker - Below Header */}
        <BiddingPortalNewsTicker />

        {/* Content Area */}
        <div className="p-4 lg:p-6 w-full max-w-full overflow-x-hidden">
          <OnboardingGuard>
            {children}
          </OnboardingGuard>
        </div>
      </main>
    </div>
  )
}

