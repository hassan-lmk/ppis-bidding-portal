'use client'

import OnboardingGuard from '../components/OnboardingGuard'

/**
 * Single guard instance for all /bidding-portal/* routes so tab navigation
 * does not remount OnboardingGuard (avoids "Checking account status..." flash).
 */
export default function BiddingPortalSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <OnboardingGuard>{children}</OnboardingGuard>
}
