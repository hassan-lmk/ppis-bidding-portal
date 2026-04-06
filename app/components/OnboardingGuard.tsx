'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Loader2 } from 'lucide-react'

interface OnboardingGuardProps {
  children: React.ReactNode
}

/**
 * Portal access rule: user may use the bidding portal only when
 * `user_profiles.onboarding_completed` is true. No admin approval check.
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { user, loading: authLoading, userProfile, adminChecked } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (pathname === '/onboarding' || pathname === '/pending-approval') {
        setChecking(false)
        return
      }

      if (authLoading || !adminChecked) return

      if (!user) {
        setChecking(false)
        return
      }

      try {
        let profile = userProfile

        if (!profile) {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, status')
            .eq('id', user.id)
            .single()

          if (error) {
            console.error('Error checking profile:', error)
            router.replace('/onboarding')
            return
          }
          profile = data
        }

        const onboardingDone = profile?.onboarding_completed === true

        if (!onboardingDone) {
          router.replace('/onboarding')
          return
        }

        setChecking(false)
      } catch (err) {
        console.error('Error checking onboarding status:', err)
        router.replace('/onboarding')
      }
    }

    checkOnboardingStatus()
  }, [user, authLoading, userProfile, adminChecked, router, pathname])

  if (checking || authLoading || !adminChecked) {
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

  return <>{children}</>
}
