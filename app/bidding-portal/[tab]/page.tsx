import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { BiddingPortalApp } from '../bidding-portal-app'
import type { PortalTab } from '../../components/BiddingPortalLayout'

const VALID_TABS = new Set<PortalTab>([
  'opened-bidding',
  'purchased-documents',
  'submitted-applications',
  'interactive-map',
  'support',
  'payments',
  'profile',
])

type Props = { params: Promise<{ tab: string }> }

export default async function BiddingPortalTabPage({ params }: Props) {
  const { tab } = await params
  if (!VALID_TABS.has(tab as PortalTab)) {
    notFound()
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
        </div>
      }
    >
      <BiddingPortalApp activeTab={tab as PortalTab} />
    </Suspense>
  )
}
