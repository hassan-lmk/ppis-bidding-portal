'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

interface OnboardingGuardProps {
  children: React.ReactNode
}

/**
 * Portal access rule: user may use the bidding portal only when
 * `user_profiles.onboarding_completed` is true.
 *
 * - If auth context already has onboarding_completed, render children immediately (no full-screen gate).
 * - Avoid re-running verification on pathname-only changes (e.g. tab routes under /bidding-portal).
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { user, loading: authLoading, userProfile, adminChecked } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [verifying, setVerifying] = useState(false)
  const ranForUserRef = useRef<string | null>(null)

  const isExempt =
    pathname === '/onboarding' || pathname === '/pending-approval'

  const contextOk = userProfile?.onboarding_completed === true

  useLayoutEffect(() => {
    if (isExempt) return
    if (authLoading || !adminChecked) return
    if (!user) return
    if (contextOk) {
      setVerifying(false)
      return
    }
    setVerifying(true)
  }, [isExempt, authLoading, adminChecked, user, contextOk])

  useEffect(() => {
    if (isExempt) {
      setVerifying(false)
      return
    }

    if (authLoading || !adminChecked) return

    if (!user) {
      setVerifying(false)
      return
    }

    if (contextOk) {
      setVerifying(false)
      ranForUserRef.current = user.id
      return
    }

    if (ranForUserRef.current === user.id) {
      setVerifying(false)
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        let profile = userProfile

        if (!profile) {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, status')
            .eq('id', user.id)
            .single()

          if (cancelled) return

          if (error) {
            console.error('Error checking profile:', error)
            router.replace('/onboarding')
            return
          }
          profile = data
        }

        if (cancelled) return

        if (profile?.onboarding_completed !== true) {
          router.replace('/onboarding')
          return
        }

        ranForUserRef.current = user.id
      } catch (err) {
        console.error('Error checking onboarding status:', err)
        if (!cancelled) router.replace('/onboarding')
      } finally {
        if (!cancelled) setVerifying(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [user, authLoading, userProfile, adminChecked, router, isExempt, contextOk])

  if (isExempt) {
    return <>{children}</>
  }

  if (authLoading || !adminChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Checking account status...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <>{children}</>
  }

  if (contextOk) {
    return <>{children}</>
  }

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600 mx-auto mb-4" />
          <p className="text-gray-600">Checking account status...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
