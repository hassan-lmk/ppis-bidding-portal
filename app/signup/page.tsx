'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { businessEmailErrorMessage, isBusinessEmail } from '../lib/business-email'
import { PASSWORD_MAX_LENGTH, passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'
import PasswordRequirements from '../components/PasswordRequirements'
import CompanyNameAutocomplete from '../components/CompanyNameAutocomplete'

const BANNER = '/images/Gemini_Generated_Image_6bkbzd6bkbzd6bkb.webp'

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, signUp } = useAuth()

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [otpToken, setOtpToken] = useState('')

  useEffect(() => {
    if (!authLoading && user) {
      const redirectParam = searchParams.get('redirect')
      router.replace(redirectParam || '/bidding-portal')
    }
  }, [user, authLoading, router, searchParams])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!companyName.trim()) {
      setError('Company name is required.')
      return
    }
    if (!isBusinessEmail(email)) {
      setError(businessEmailErrorMessage())
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!passwordMeetsPolicy(password)) {
      setError(passwordPolicyErrorMessage())
      return
    }

    setLoading(true)
    try {
      const { error: signErr } = await signUp(
        email.trim(),
        password,
        fullName.trim(),
        companyName.trim(),
      )

      if (signErr) {
        if (signErr.message?.includes?.('already registered')) {
          setError('This email is already registered. Please sign in instead.')
        } else {
          setError(signErr.message || 'Could not create account.')
        }
        setLoading(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        const redirectParam = searchParams.get('redirect')
        window.location.href = redirectParam || '/onboarding'
        return
      }

      sessionStorage.setItem('pending_verification_email', email.trim())
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const pendingEmail =
      sessionStorage.getItem('pending_verification_email') || email.trim()
    if (!pendingEmail) {
      setError('Email not found. Please start over.')
      return
    }
    if (otpToken.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit code from your email.')
      return
    }

    setLoading(true)
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: otpToken.replace(/\D/g, ''),
        type: 'email',
      })

      if (verifyErr) {
        setError(verifyErr.message)
        setLoading(false)
        return
      }

      sessionStorage.removeItem('pending_verification_email')
      await new Promise(r => setTimeout(r, 500))
      const redirectParam = searchParams.get('redirect')
      window.location.href = redirectParam || '/onboarding'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-teal-500" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 md:py-16 px-4">
      <div className="absolute inset-0 z-0">
        <Image src={BANNER} alt="" fill className="object-cover" sizes="100vw" priority />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-4">
            <Link href="/" className="inline-flex justify-center">
              <Image
                src="/images/PPIS-logo-bg.png"
                alt="PPIS"
                width={160}
                height={52}
                className="h-12 w-auto mx-auto"
              />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Create bidder account</h1>
            <p className="text-gray-500 text-sm mt-1">
              Register to explore blocks, purchase documents, and submit bids.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 'form' ? (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  disabled={loading}
                />
              </div>
              <CompanyNameAutocomplete
                value={companyName}
                onChange={setCompanyName}
                disabled={loading}
                ringClass="focus:ring-teal-500"
              />
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  disabled={loading}
                  placeholder="you@yourcompany.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use your organisation&apos;s email. Personal inboxes (Gmail, Yahoo, Outlook, etc.) are not
                  accepted.
                </p>
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={e => setPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                    maxLength={PASSWORD_MAX_LENGTH}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <PasswordRequirements password={password} className="mt-3" />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  maxLength={PASSWORD_MAX_LENGTH}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !companyName.trim() ||
                  !passwordMeetsPolicy(password) ||
                  password !== confirmPassword
                }
                className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Creating account…</span>
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} className="space-y-4">
              <div className="flex items-center gap-2 text-teal-700">
                <Mail className="w-5 h-5 shrink-0" />
                <h2 className="font-semibold text-gray-900">Verify your email</h2>
              </div>
              <p className="text-sm text-gray-600">
                We sent a code to{' '}
                <strong>{sessionStorage.getItem('pending_verification_email') || email}</strong>. Enter it below.
              </p>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  Verification code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpToken}
                  onChange={e => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || otpToken.replace(/\D/g, '').length !== 6}
                className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                Verify and continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('form')
                  setOtpToken('')
                  setError('')
                }}
                className="w-full text-sm text-teal-600 hover:text-teal-800 font-medium"
              >
                ← Back to form
              </button>
            </form>
          )}

          <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-teal-600 hover:text-teal-800 font-medium">
                Sign in
              </Link>
            </p>
            <p className="text-sm text-gray-600 mt-2">
              <Link href="/" className="text-teal-600 hover:text-teal-800 font-medium">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-500" />
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  )
}
