import type { PortalTab } from '../components/BiddingPortalLayout'

/** Central keys for TanStack Query — use for invalidation after mutations. */
export const biddingPortalQueryKeys = {
  portalStatus: () => ['bidding-portal', 'status'] as const,
  sidebarCounts: (userId: string) => ['bidding-portal', 'sidebar-counts', userId] as const,
  tab: (tab: PortalTab, userId: string) => ['bidding-portal', 'tab', tab, userId] as const,
  allForUser: (userId: string) => ['bidding-portal', userId] as const,
}
