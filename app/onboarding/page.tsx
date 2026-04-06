"use client"
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import CompanyNameAutocomplete from '../components/CompanyNameAutocomplete'

/** Bidding portal onboarding always registers users as bidders. */
const ONBOARDING_USER_TYPE = 'bidder' as const

export default function OnboardingPage() {
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [pocContactNumber, setPocContactNumber] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [contactNumberError, setContactNumberError] = useState('')
  const companyPrefilledFromSignupRef = useRef(false)

  const router = useRouter()
  const { user, loading: authLoading, userProfile, adminChecked, refreshAdminStatus } = useAuth()

  // Check if user needs onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      // Wait for auth to finish loading and profile to be loaded
      if (authLoading || !adminChecked) return
      
      if (!user) {
        router.push('/login')
        return
      }

      try {
        // Use cached profile if available, otherwise fetch from database
        let profile = userProfile
        
        if (!profile) {
          console.log('Profile not cached in onboarding, fetching from database...')
          const { data, error: profileError } = await supabase
            .from('user_profiles')
            .select('onboarding_completed, status')
            .eq('id', user.id)
            .single()

          if (profileError) {
            console.error('Error checking profile:', profileError)
            setCheckingStatus(false)
            return
          }
          profile = data
        }

        if (profile?.onboarding_completed === true) {
          router.push('/bidding-portal')
        } else {
          setCheckingStatus(false)
        }
      } catch (err) {
        console.error('Error:', err)
        setCheckingStatus(false)
      }
    }

    checkOnboardingStatus()
  }, [user, router, authLoading, userProfile, adminChecked])

  // Pre-fill company from signup (stored in auth user metadata)
  useEffect(() => {
    if (!user || companyPrefilledFromSignupRef.current) return
    const raw = user.user_metadata?.company_name
    if (typeof raw === 'string' && raw.trim()) {
      setCompanyName(raw.trim())
      companyPrefilledFromSignupRef.current = true
    }
  }, [user])

  // Validate contact number format
  const validateContactNumber = (value: string): string => {
    if (!value.trim()) {
      return 'Contact number is required'
    }
    
    const cleaned = value.replace(/\s/g, '')
    const phoneRegex = /^[\d+\-()]+$/
    if (!phoneRegex.test(value)) {
      return 'Contact number can only contain numbers, spaces, +, -, and parentheses'
    }
    
    const digitsOnly = value.replace(/\D/g, '')
    if (digitsOnly.length < 7) {
      return 'Contact number must contain at least 7 digits'
    }
    
    if (value.length > 50) {
      return 'Contact number must be less than 50 characters'
    }
    
    return ''
  }

  const handleContactNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const sanitized = value.replace(/[^\d\s+\-()]/g, '')
    setPocContactNumber(sanitized)
    
    if (sanitized) {
      const validationError = validateContactNumber(sanitized)
      setContactNumberError(validationError)
    } else {
      setContactNumberError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setContactNumberError('')
    setLoading(true)

    if (!companyName.trim()) {
      setError('Company name is required')
      setLoading(false)
      return
    }

    if (!address.trim()) {
      setError('Address is required')
      setLoading(false)
      return
    }

    const contactValidationError = validateContactNumber(pocContactNumber)
    if (contactValidationError) {
      setError(contactValidationError)
      setContactNumberError(contactValidationError)
      setLoading(false)
      return
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('complete_user_onboarding', {
        p_company_name: companyName.trim(),
        p_address: address.trim(),
        p_poc_contact_number: pocContactNumber.trim(),
        p_user_type: ONBOARDING_USER_TYPE,
      })

      if (rpcError) {
        console.error('RPC Error:', rpcError)
        setError(rpcError.message || 'Failed to complete onboarding')
        setLoading(false)
        return
      }

      const result = data as { success: boolean; message: string; status?: string; user_type?: string }

      if (result.success) {
        try {
          const displayName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
          
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'onboarding-completed-user',
              to: user?.email,
              userName: displayName,
              companyName: companyName.trim(),
              address: address.trim(),
              contactNumber: pocContactNumber.trim()
            })
          })
          
          const { data: admins, error: adminError } = await supabase
            .from('user_profiles')
            .select('email')
            .eq('user_type', 'admin')
          
          if (adminError) {
            console.error('Error fetching admin emails:', adminError)
          } else if (admins && admins.length > 0) {
            const emailPromises = admins
              .filter(admin => admin.email)
              .map(admin => 
                fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'onboarding-completed-admin',
                    to: admin.email,
                    userName: displayName,
                    userEmail: user?.email,
                    companyName: companyName.trim(),
                    address: address.trim(),
                    contactNumber: pocContactNumber.trim(),
                    accountType: 'Bidder Access',
                  })
                })
              )
            
            Promise.allSettled(emailPromises)
          }
        } catch (emailError) {
          console.error('Error sending emails:', emailError)
        }
        
        setSuccess(result.message)
        await refreshAdminStatus()
        
        setTimeout(() => {
          router.push('/bidding-portal')
        }, 1500)
      } else {
        setError(result.message || 'Failed to complete onboarding')
        setLoading(false)
      }
    } catch (err) {
      console.error('Error completing onboarding:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (checkingStatus) {
    return (
      <div className="relative min-h-screen flex items-center justify-center py-12 md:py-16">
        <div className="absolute inset-0 w-full h-full z-0">
          <img src="/images/Banner-2.webp" alt="Onboarding Banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-20 w-full flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Checking your profile...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 md:py-16">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/bidding-portal" className="text-teal-600 font-semibold text-lg">
            PPIS Bidding Portal
          </Link>
        </div>
      </div>

      {/* Background Image */}
      <div className="absolute inset-0 w-full h-full z-0">
        <img src="/images/Banner-2.webp" alt="Onboarding Banner" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />
      </div>
      
      {/* Centered Form */}
      <div className="relative z-20 w-full flex items-center justify-center px-4 mt-20">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
          <div className="text-center">
            <div className="mb-4">
              <div className="w-16 h-16 bg-teal-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Complete Your Profile
            </h2>
            <p className="text-gray-500 mb-2">
              We need a few more details to set up your bidder account
            </p>
            <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 text-left">
              You are registering on the <span className="font-semibold">Bidding Portal</span> — your access type is{' '}
              <span className="font-semibold">Bidder</span>. Complete your organisation details below.
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="bg-gray-100 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Email Verified</span>
              </div>
              <div className="text-gray-400">→</div>
              <div className="flex items-center text-teal-600 font-medium">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
                </svg>
                <span>Profile Setup</span>
              </div>
              <div className="text-gray-400">→</div>
              <div className="flex items-center text-teal-600 font-medium">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Portal access</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 text-red-700 px-4 py-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-100 text-green-700 px-4 py-3 rounded-lg text-center">
              {success}
            </div>
          )}

          <CompanyNameAutocomplete
            value={companyName}
            onChange={setCompanyName}
            disabled={loading}
            label="Company name"
            helperText="Select from the list or type to search. You can also enter a custom company name."
          />

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
              Company Address <span className="text-red-500">*</span>
            </label>
            <textarea
              id="address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent resize-none"
              placeholder="Enter your company address"
              rows={3}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="pocContactNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Point of Contact Number <span className="text-red-500">*</span>
            </label>
            <input
              id="pocContactNumber"
              type="tel"
              value={pocContactNumber}
              onChange={handleContactNumberChange}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent ${
                contactNumberError 
                  ? 'border-red-500 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-teal-600'
              }`}
              placeholder="+92 XXX XXXXXXX"
              required
              disabled={loading}
            />
            {contactNumberError ? (
              <p className="text-xs text-red-500 mt-1">
                {contactNumberError}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Include country code (e.g., +92 for Pakistan). Only numbers, spaces, +, -, and parentheses are allowed.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition-colors text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Completing Profile...' : 'Complete Profile'}
          </button>

          <p className="text-xs text-center text-gray-500">
            After you submit, you can use the bidding portal right away.
          </p>
        </form>
      </div>
    </div>
  )
}
