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
 * OnboardingGuard - Checks if user has completed onboarding and is approved
 * Redirects to onboarding or pending-approval pages if needed
 * Excludes onboarding and pending-approval pages from checks
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const { user, loading: authLoading, userProfile, adminChecked } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Skip check if we're on onboarding or pending-approval pages
      if (pathname === '/onboarding' || pathname === '/pending-approval') {
        setChecking(false)
        return
      }

      // Wait for auth to finish loading and profile to be loaded
      if (authLoading || !adminChecked) return
      
      if (!user) {
        // Not logged in - let the auth guard handle it
        setChecking(false)
        return
      }

      try {
        // Use cached profile if available, otherwise fetch from database
        let profile = userProfile
        
        if (!profile) {
          console.log('Profile not cached, fetching from database...')
          const { data, error } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, admin_approved, status')
            .eq('id', user.id)
            .single()

          if (error) {
            console.error('Error checking profile:', error)
            setChecking(false)
            return
          }
          profile = data
        }

        // Check onboarding status
        if (!profile?.onboarding_completed) {
          // Redirect to onboarding page
          router.replace('/onboarding')
          return
        }

        // Check approval status
        if (!profile.admin_approved) {
          // Redirect to pending approval page
          router.replace('/pending-approval')
          return
        }

        // User is approved, allow access
        setChecking(false)
      } catch (err) {
        console.error('Error checking onboarding status:', err)
        setChecking(false)
      }
    }

    checkOnboardingStatus()
  }, [user, authLoading, userProfile, adminChecked, router, pathname])

  // Show loading while checking
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

  // If user is not logged in, let auth guard handle redirect
  if (!user) {
    return <>{children}</>
  }

  // User is logged in and approved, show content
  return <>{children}</>
}
