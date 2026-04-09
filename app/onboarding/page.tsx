"use client"
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Loader2 } from 'lucide-react'
import CompanyNameAutocomplete from '../components/CompanyNameAutocomplete'

/** Bidding portal onboarding always registers users as bidders. */
const ONBOARDING_USER_TYPE = 'bidder' as const

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#317070]/25 focus:border-[#317070] transition-shadow disabled:opacity-60'

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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#317070] mx-auto mb-3" />
          <p className="text-gray-600">Checking your profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 w-full grid grid-cols-1 lg:grid-cols-2">
      {/* Left: visual panel */}
      <div className="relative order-2 lg:order-1 min-h-[620px] lg:min-h-full overflow-hidden flex flex-col justify-between px-8 py-8 md:px-10 md:py-10 lg:pl-12 lg:pr-0 lg:py-12 xl:pl-16 xl:pr-0 xl:py-16 text-white bg-gradient-to-br from-[#317070] via-teal-700 to-teal-900">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='8' cy='8' r='1.5'/%3E%3Ccircle cx='30' cy='8' r='1.5'/%3E%3Ccircle cx='52' cy='8' r='1.5'/%3E%3Ccircle cx='8' cy='30' r='1.5'/%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3Ccircle cx='52' cy='30' r='1.5'/%3E%3Ccircle cx='8' cy='52' r='1.5'/%3E%3Ccircle cx='30' cy='52' r='1.5'/%3E%3Ccircle cx='52' cy='52' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <Link
              href="/bidding-portal"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white border border-white/35 bg-white/10 shadow-sm hover:bg-white/20 transition-colors"
              aria-label="Back to portal"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <Image
              src="/images/logo.webp"
              alt="PPIS"
              width={150}
              height={48}
              className="h-9 w-auto"
            />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold leading-tight max-w-xl">
            Complete your profile to activate your bidder access and continue in the portal.
          </h2>
          <p className="text-sm md:text-base text-teal-100/95 max-w-md leading-relaxed">
            Add your organization details once to enable document purchase and bid submission workflows.
          </p>
        </div>

        <div className="relative z-10 mt-8 lg:mt-auto w-full flex justify-end items-end">
          <div className="relative h-[300px] md:h-[400px] lg:h-[62vh] xl:h-[68vh] w-[130%] lg:w-[150%] ml-auto">
            <Image
              src="/images/signup-mockup-image.png"
              alt="Bidding portal preview"
              fill
              className="object-contain object-[right_bottom]"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority={false}
            />
          </div>
        </div>
      </div>

      {/* Right: onboarding form */}
      <div className="order-1 lg:order-2 flex flex-col justify-center bg-white px-8 pb-8 pt-5 md:px-10 md:pb-10 md:pt-6 lg:px-12 lg:pb-10 lg:pt-8 xl:px-20 2xl:px-28 lg:min-h-full">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md lg:max-w-lg xl:max-w-xl space-y-5">
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Complete your profile
              </h1>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                We need a few details to finish setting up your bidder account.
              </p>
            </div>
            <p className="text-sm text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 text-left">
              You are registering on the <span className="font-semibold">Bidding Portal</span> — your access type is{' '}
              <span className="font-semibold">Bidder</span>. Complete your organization details below.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
              {success}
            </div>
          )}

          <CompanyNameAutocomplete
            value={companyName}
            onChange={setCompanyName}
            disabled={loading}
            label="Company name"
            helperText="Select from the list or type to search. You can also enter a custom company name."
            ringClass="focus:ring-[#317070]"
          />

          <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1.5">
              Company Address <span className="text-red-500">*</span>
            </label>
            <textarea
              id="address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Enter your company address"
              rows={3}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="pocContactNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
              Point of Contact Number <span className="text-red-500">*</span>
            </label>
            <input
              id="pocContactNumber"
              type="tel"
              value={pocContactNumber}
              onChange={handleContactNumberChange}
              className={`w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent ${
                contactNumberError 
                  ? 'border-red-500 focus:ring-red-500 bg-white' 
                  : 'border-gray-200 focus:ring-[#317070]/25 focus:border-[#317070] bg-white'
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
            className="w-full py-3.5 rounded-xl bg-[#317070] text-white font-semibold shadow-md hover:bg-[#285e5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
