"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

export default function PendingApprovalPage() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'checking'>('checking')
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [navigated, setNavigated] = useState(false)
  const router = useRouter()
  const { user, signOut, loading, userProfile, adminChecked } = useAuth()

  useEffect(() => {
    let isMounted = true

    const checkStatus = async () => {
      if (loading || !adminChecked) return
      if (!user) {
        if (!navigated) {
          router.replace('/login')
          setNavigated(true)
        }
        return
      }

      try {
        let profile = userProfile
        
        if (!profile) {
          console.log('Profile not cached in pending-approval, fetching from database...')
          const { data, error } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, admin_approved, status, rejection_reason')
            .eq('id', user.id)
            .single()

          if (error) {
            console.error('Error checking status:', error)
            if (isMounted) setStatus('pending')
            return
          }
          profile = data
        }

        if (profile?.onboarding_completed !== true) {
          if (isMounted && !navigated) {
            router.replace('/onboarding')
            setNavigated(true)
          }
          return
        }

        if (profile.status === 'rejected') {
          if (isMounted) {
            setStatus('rejected')
            setRejectionReason(profile.rejection_reason ?? null)
          }
          return
        }

        if (isMounted && !navigated) {
          router.replace('/bidding-portal')
          setNavigated(true)
        }
      } catch (err) {
        console.error('Error:', err)
        if (isMounted) setStatus('pending')
      }
    }

    checkStatus()

    const interval = setInterval(() => {
      if (!navigated && (status === 'pending' || status === 'checking')) {
        checkStatus()
      }
    }, 30000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [user?.id, loading, navigated, status, userProfile, adminChecked])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  if (status === 'checking') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0 w-full h-full">
          <img src="/images/Banner-2.webp" alt="Status Banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 w-full flex items-center justify-center px-4 mt-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Checking your status...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="absolute inset-0 w-full h-full">
          <img src="/images/Banner-2.png" alt="Rejected Banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 w-full flex items-center justify-center px-4 mt-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Account Not Approved
              </h2>
              <p className="text-gray-600 mb-4">
                Your account application was not approved by our admin team.
              </p>
              {rejectionReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-red-800 mb-1">Reason:</p>
                  <p className="text-sm text-red-700">{rejectionReason}</p>
                </div>
              )}
              <p className="text-sm text-gray-500 mb-6">
                If you believe this is an error, please contact our support team.
              </p>
              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="absolute inset-0 w-full h-full">
        <img src="/images/Banner-2.png" alt="Pending Banner" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className="relative z-10 w-full flex items-center justify-center px-4 mt-20">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full space-y-4">
          <div className="text-center">
            {/* Animated Icon */}
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 bg-teal-600 rounded-full opacity-20 animate-ping"></div>
              <div className="relative w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Account Under Review
            </h2>
            <p className="text-gray-600 mb-4">
              Thank you for completing your profile! Your account is currently being reviewed by our admin team.
            </p>

            {/* Progress Steps */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="flex items-center text-xs">
                  <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-2">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-green-700 font-medium">Email verified</span>
                </div>
                <div className="flex items-center text-xs">
                  <div className="flex-shrink-0 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-2">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-green-700 font-medium">Profile completed</span>
                </div>
                <div className="flex items-center text-xs">
                  <div className="flex-shrink-0 w-5 h-5 bg-teal-600 rounded-full flex items-center justify-center mr-2 animate-pulse">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-teal-600 font-medium">Waiting for approval...</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-800">
                <strong>What happens next?</strong><br />
                You&apos;ll receive an email notification once your account is approved. You can then access all features of the portal.
              </p>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
