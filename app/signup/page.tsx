'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { businessEmailErrorMessage, isBusinessEmail } from '../lib/business-email'
import { PASSWORD_MAX_LENGTH, passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'
import PasswordRequirements from '../components/PasswordRequirements'

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#317070]/25 focus:border-[#317070] transition-shadow disabled:opacity-60'

function SignupContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, signUp } = useAuth()

  const [fullName, setFullName] = useState('')
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-[#317070]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 w-full grid grid-cols-1 lg:grid-cols-2">
          {/* Left: visual + image placeholder */}
          <div
            className="relative order-2 lg:order-1 min-h-[620px] lg:min-h-full overflow-hidden flex flex-col justify-between px-8 py-8 md:px-10 md:py-10 lg:pl-12 lg:pr-0 lg:py-12 xl:pl-16 xl:pr-0 xl:py-16 text-white bg-gradient-to-br from-[#317070] via-teal-700 to-teal-900"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='8' cy='8' r='1.5'/%3E%3Ccircle cx='30' cy='8' r='1.5'/%3E%3Ccircle cx='52' cy='8' r='1.5'/%3E%3Ccircle cx='8' cy='30' r='1.5'/%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3Ccircle cx='52' cy='30' r='1.5'/%3E%3Ccircle cx='8' cy='52' r='1.5'/%3E%3Ccircle cx='30' cy='52' r='1.5'/%3E%3Ccircle cx='52' cy='52' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                <Link
                  href="/"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white border border-white/35 bg-white/10 shadow-sm hover:bg-white/20 transition-colors"
                  aria-label="Back to home"
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
                Register to explore blocks, purchase Bidding documents, and submit bids — all in one place.
              </h2>
              <p className="text-sm md:text-base text-teal-100/95 max-w-md leading-relaxed">
                Download bidding documents for Pakistan&apos;s oil and gas sector and submit your bid applications through one secure digital platform.
              </p>
            </div>

            <div className="relative z-10 mt-8 lg:mt-auto w-full flex justify-end items-end">
              {/* Large mockup pinned to bottom-right corner */}
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

          {/* Right: form */}
          <div className="order-1 lg:order-2 flex flex-col justify-center bg-white px-8 pb-8 pt-5 md:px-10 md:pb-10 md:pt-6 lg:px-12 lg:pb-10 lg:pt-8 xl:px-20 2xl:px-28 lg:min-h-full">
            <div className="mx-auto w-full max-w-md lg:max-w-lg xl:max-w-xl space-y-5">
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                    {step === 'form' ? 'Create your account' : 'Verify your email'}
                  </h1>
                  <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                    {step === 'form'
                      ? 'Enter your details below to register as a bidder.'
                      : 'Enter the code we sent to complete registration.'}
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {step === 'form' ? (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Full name
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      className={inputClass}
                      required
                      disabled={loading}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className={inputClass}
                      required
                      disabled={loading}
                      placeholder="you@yourcompany.com"
                    />
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Use your organisation&apos;s email. Personal inboxes (Gmail, Yahoo, Outlook, etc.) are not
                      accepted.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={e => setPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                        className={`${inputClass} pr-10`}
                        required
                        maxLength={PASSWORD_MAX_LENGTH}
                        disabled={loading}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-md"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    <PasswordRequirements password={password} columns={2} className="mt-3" />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
                      className={inputClass}
                      required
                      maxLength={PASSWORD_MAX_LENGTH}
                      disabled={loading}
                      placeholder="••••••••"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !passwordMeetsPolicy(password) ||
                      password !== confirmPassword
                    }
                    className="w-full py-3.5 rounded-xl bg-[#317070] text-white font-semibold shadow-md hover:bg-[#285e5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  <div className="flex items-center gap-2 text-[#317070]">
                    <Mail className="w-5 h-5 shrink-0" />
                    <h2 className="font-semibold text-gray-900">Check your inbox</h2>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    We sent a code to{' '}
                    <strong className="text-gray-900">
                      {sessionStorage.getItem('pending_verification_email') || email}
                    </strong>
                    . Enter it below.
                  </p>
                  <div>
                    <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Verification code
                    </label>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpToken}
                      onChange={e => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={`${inputClass} text-center text-2xl tracking-[0.35em] font-mono py-3`}
                      placeholder="••••••"
                      maxLength={6}
                      required
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading || otpToken.replace(/\D/g, '').length !== 6}
                    className="w-full py-3.5 rounded-xl bg-[#317070] text-white font-semibold hover:bg-[#285e5e] disabled:opacity-50 flex items-center justify-center gap-2"
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
                    className="w-full text-sm text-[#317070] hover:text-[#285e5e] font-medium"
                  >
                    ← Back to form
                  </button>
                </form>
              )}

              <div className="pt-6 border-t border-gray-100 space-y-3 text-center text-sm text-gray-600">
                <p>
                  Already have an account?{' '}
                  <Link href="/login" className="text-[#317070] hover:text-[#285e5e] font-semibold">
                    Sign in
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
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#317070]" />
        </div>
      }
    >
      <SignupContent />
    </Suspense>
  )
}
