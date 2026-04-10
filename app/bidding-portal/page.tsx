import { redirect } from 'next/navigation'

const VALID_TABS = new Set([
  'opened-bidding',
  'purchased-documents',
  'submitted-applications',
  'interactive-map',
  'support',
  'payments',
  'profile',
])

type Props = {
  searchParams: Promise<{ tab?: string; openCart?: string }>
}

/** Legacy `?tab=` and root `/bidding-portal` resolve to path-based tab routes. */
export default async function BiddingPortalIndexPage({ searchParams }: Props) {
  const sp = await searchParams
  const tab = sp.tab && VALID_TABS.has(sp.tab) ? sp.tab : 'opened-bidding'
  const suffix = sp.openCart === '1' ? '?openCart=1' : ''
  redirect(`/bidding-portal/${tab}${suffix}`)
}
