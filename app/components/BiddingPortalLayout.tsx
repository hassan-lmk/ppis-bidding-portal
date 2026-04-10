'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { biddingPortalQueryKeys } from '../lib/bidding-portal-query-keys'
import { fetchPortalSidebarCounts } from '../lib/fetch-portal-sidebar-counts'
import { Button } from './ui/button'
import { 
  Building2, Home, LogOut, User, Menu, X, FolderOpen, FileStack, 
  ClipboardCheck, Map as MapIcon, MessageSquare, Loader2, ChevronLeft, ChevronRight, CreditCard
} from 'lucide-react'
import Image from 'next/image'
import BiddingPortalNewsTicker from './BiddingPortalNewsTicker'

export type PortalTab = 
  | 'opened-bidding' 
  | 'purchased-documents' 
  | 'submitted-applications'
  | 'interactive-map'
  | 'support'
  | 'payments'
  | 'profile'
  | 'bid-submission'

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  /** Defer sidebar counts until after first paint to improve TTI */
  const [sidebarCountsReady, setSidebarCountsReady] = useState(false)
  const { user, loading: authLoading, signOut, userProfile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) {
      setSidebarCountsReady(false)
      return
    }
    const w = typeof window !== 'undefined' ? window : undefined
    let cancelled = false
    const run = () => {
      if (!cancelled) setSidebarCountsReady(true)
    }
    let id: ReturnType<typeof setTimeout> | number
    if (w && typeof w.requestIdleCallback === 'function') {
      id = w.requestIdleCallback(run, { timeout: 1500 })
    } else {
      id = setTimeout(run, 1)
    }
    return () => {
      cancelled = true
      if (w && typeof w.cancelIdleCallback === 'function' && typeof id === 'number') {
        w.cancelIdleCallback(id)
      } else {
        clearTimeout(id as ReturnType<typeof setTimeout>)
      }
    }
  }, [user?.id])

  const { data: counts = {
    openBlocks: 0,
    purchased: 0,
    submitted: 0,
    tickets: 0,
    payments: 0,
  } } = useQuery({
    queryKey: biddingPortalQueryKeys.sidebarCounts(user?.id ?? ''),
    queryFn: () => fetchPortalSidebarCounts(user!.id),
    enabled: !!user?.id && sidebarCountsReady,
    staleTime: 90_000,
  })

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/bidding-portal')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      void fetchCompanyName()
    }
  }, [user])

  const fetchCompanyName = async () => {
    if (!user) return

    if (userProfile?.company_name) {
      setCompanyName(userProfile.company_name)
      return
    }

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

  const sidebarItems: SidebarItem[] = [
    { 
      id: 'opened-bidding', 
      label: 'Purchase Bid Documents', 
      icon: FolderOpen,
      href: '/bidding-portal/opened-bidding',
      count: counts.openBlocks
    },
    { 
      id: 'purchased-documents', 
      label: 'Submit Bid Application', 
      icon: FileStack,
      href: '/bidding-portal/purchased-documents',
      count: counts.purchased
    },
    { 
      id: 'submitted-applications', 
      label: 'Bids Submitted', 
      icon: ClipboardCheck,
      href: '/bidding-portal/submitted-applications',
      count: counts.submitted
    },
    { 
      id: 'payments', 
      label: 'Payment History', 
      icon: CreditCard,
      href: '/bidding-portal/payments'
    },
    { 
      id: 'support', 
      label: 'Support Tickets', 
      icon: MessageSquare,
      href: '/bidding-portal/support',
      count: counts.tickets
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: User,
      href: '/bidding-portal/profile',
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
        w-64 min-h-screen flex flex-col py-6
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        lg:transition-[width] lg:duration-300 lg:ease-in-out
        ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}
      `}>
        {/* 24px (py-6) top/bottom inset from viewport; rounds the outer (right) edge */}
        <div className={`flex-1 h-full min-h-0 bg-[#317070] rounded-r-2xl py-4 lg:py-6 flex flex-col ${sidebarCollapsed ? 'px-2' : 'px-3 lg:px-3'}`}>
          {/* Logo on colored background */}
          <div className="mb-4 lg:mb-6">
            {/* Desktop collapse control (full-screen view) */}
            <div className="hidden lg:flex justify-end mb-2">
              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                type="button"
              >
                {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            </div>
            <Link
              href="/bidding-portal/opened-bidding"
              className={`flex items-center justify-center mb-3 lg:mb-4 ${sidebarCollapsed ? 'px-1' : ''}`}
              title="Bidding Portal"
            >
              <Image
                src="/images/Logo-white.svg"
                alt="PPIS Logo"
                width={120}
                height={38}
                className={sidebarCollapsed ? 'h-8 w-auto' : 'h-8 lg:h-10 w-auto'}
              />
            </Link>
            {!sidebarCollapsed && (
              <div className="text-center">
                <h1 className="text-sm lg:text-base font-bold text-white">Bidding Portal</h1>
                <p className="text-[10px] lg:text-xs text-white/80">PPIS Pakistan</p>
              </div>
            )}
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
              const isActive = activeTab === item.id
              return (
                <Link
                  key={item.id}
                  href={item.href || '/bidding-portal/opened-bidding'}
                  onClick={() => setSidebarOpen(false)}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center justify-between px-2 lg:px-2.5 py-1.5 lg:py-2 rounded-lg text-left
                    transition-all duration-200
                    ${isActive 
                      ? 'bg-white/20 text-white border border-white/30' 
                      : 'text-white/80 hover:bg-white/10 hover:text-white border border-transparent'
                    }
                  `}
                >
                  <div className={`flex items-center min-w-0 flex-1 ${sidebarCollapsed ? 'justify-center' : 'space-x-2 lg:space-x-2.5'}`}>
                    <Icon className={`w-3.5 h-3.5 lg:w-4 lg:h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-white/60'}`} />
                    {!sidebarCollapsed && (
                      <span className="font-medium text-xs lg:text-sm truncate">{item.label}</span>
                    )}
                  </div>
                  {!sidebarCollapsed && item.count !== undefined && item.count > 0 && (
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
            {user && !sidebarCollapsed && (
              <div className="px-2 lg:px-2.5 py-1.5 lg:py-2 bg-white/10 rounded-lg">
                <div className="flex items-center space-x-2 lg:space-x-2.5">
                  <div className="w-6 h-6 lg:w-7 lg:h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href="/bidding-portal/profile"
                      className="text-[10px] lg:text-xs font-medium text-white truncate underline-offset-2 hover:underline"
                      title="View profile details"
                    >
                      {companyName || userProfile?.company_name || 'Company Name'}
                    </Link>
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
              {!sidebarCollapsed && <span className="font-medium text-xs lg:text-sm truncate">Return to main PPISwebsite</span>}
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
              {!sidebarCollapsed && <span className="font-medium text-xs lg:text-sm truncate">Sign Out</span>}
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
                onClick={() => {
                  // Mobile: show/hide overlay drawer. Desktop: collapse to icons-only.
                  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
                    setSidebarCollapsed((v) => !v)
                  } else {
                    setSidebarOpen((v) => !v)
                  }
                }}
                className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                type="button"
              >
                {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
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
          {children}
        </div>
      </main>
    </div>
  )
}

