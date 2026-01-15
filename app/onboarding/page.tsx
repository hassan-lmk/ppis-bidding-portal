"use client"
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

export default function OnboardingPage() {
  const [accountType, setAccountType] = useState<'company' | 'bidder'>('company')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [pocContactNumber, setPocContactNumber] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [contactNumberError, setContactNumberError] = useState('')
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false)
  const [companyNames, setCompanyNames] = useState<string[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<string[]>([])
  const companyInputRef = useRef<HTMLInputElement>(null)
  const companyDropdownRef = useRef<HTMLDivElement>(null)

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
            .select('onboarding_completed, admin_approved, status')
            .eq('id', user.id)
            .single()

          if (profileError) {
            console.error('Error checking profile:', profileError)
            setCheckingStatus(false)
            return
          }
          profile = data
        }

        // If onboarding is already completed, redirect based on status
        if (profile?.onboarding_completed) {
          if (profile.admin_approved) {
            router.push('/bidding-portal') // Redirect to bidding portal if approved
          } else {
            router.push('/pending-approval') // Redirect to pending approval page
          }
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

  // Fetch companies from database
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies')
        if (response.ok) {
          const companies = await response.json()
          setCompanyNames(companies)
          setFilteredCompanies(companies)
        } else {
          console.error('Failed to fetch companies')
          setCompanyNames([])
          setFilteredCompanies([])
        }
      } catch (error) {
        console.error('Error fetching companies:', error)
        setCompanyNames([])
        setFilteredCompanies([])
      }
    }

    fetchCompanies()
  }, [])

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

  const handleCompanyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCompanyName(value)
    
    if (value.trim()) {
      const filtered = companyNames.filter(company =>
        company.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredCompanies(filtered)
      setShowCompanyDropdown(true)
    } else {
      setFilteredCompanies(companyNames)
      setShowCompanyDropdown(true)
    }
  }

  const handleCompanyNameFocus = () => {
    setShowCompanyDropdown(true)
    setFilteredCompanies(companyNames)
  }

  const handleCompanySelect = (company: string) => {
    setCompanyName(company)
    setShowCompanyDropdown(false)
    companyInputRef.current?.focus()
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(event.target as Node) &&
        companyInputRef.current &&
        !companyInputRef.current.contains(event.target as Node)
      ) {
        setShowCompanyDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

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
        p_user_type: accountType
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
                    accountType: accountType === 'company' ? 'PPIS Subscriber' : 'Bidder Access'
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
          router.push('/pending-approval')
        }, 2000)
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
            <p className="text-gray-500 mb-6">
              We need a few more details to set up your account
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
              <div className="flex items-center text-gray-400">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
                </svg>
                <span>Admin Approval</span>
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

          {/* Account Type Selection */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Account Type <span className="text-red-500">*</span>
            </label>
            <div className="space-y-3">
              <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-blue-100"
                style={{ borderColor: accountType === 'company' ? '#0d9488' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="accountType"
                  value="company"
                  checked={accountType === 'company'}
                  onChange={(e) => setAccountType(e.target.value as 'company' | 'bidder')}
                  className="mt-1 mr-3 text-teal-600 focus:ring-teal-600"
                  disabled={loading}
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">PPIS Subscriber</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Full access to all restricted pages including upstream maps, activities, data review, and bidding blocks.
                  </div>
                </div>
              </label>
              
              <label className="flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all hover:bg-blue-100"
                style={{ borderColor: accountType === 'bidder' ? '#0d9488' : '#e5e7eb' }}>
                <input
                  type="radio"
                  name="accountType"
                  value="bidder"
                  checked={accountType === 'bidder'}
                  onChange={(e) => setAccountType(e.target.value as 'company' | 'bidder')}
                  className="mt-1 mr-3 text-teal-600 focus:ring-teal-600"
                  disabled={loading}
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Bidder Access</div>
                  <div className="text-sm text-gray-600 mt-1">
                    Access to bidding blocks page and public pages only. Perfect for companies who want to purchase bidding documents.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="relative">
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
              Company Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="companyName"
                ref={companyInputRef}
                type="text"
                value={companyName}
                onChange={handleCompanyNameChange}
                onFocus={handleCompanyNameFocus}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                placeholder="Select or enter your company name"
                required
                disabled={loading}
                autoComplete="off"
              />
              {showCompanyDropdown && filteredCompanies.length > 0 && (
                <div
                  ref={companyDropdownRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {filteredCompanies.map((company, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleCompanySelect(company)}
                      className="w-full text-left px-4 py-2 hover:bg-teal-600 hover:text-white transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg"
                    >
                      {company}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Select from the list or type to search. You can also enter a custom company name.
            </p>
          </div>

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
            After completing your profile, an admin will review your account before granting full access.
          </p>
        </form>
      </div>
    </div>
  )
}
