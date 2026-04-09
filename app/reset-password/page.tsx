'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import PasswordRequirements from '../components/PasswordRequirements'
import { passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'

type Step = 'email' | 'otp' | 'new-password'

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#317070]/25 focus:border-[#317070] transition-shadow disabled:opacity-60'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const emailParam = searchParams?.get('email')
    if (emailParam) {
      setEmail(emailParam)
      setStep('otp')
    }
  }, [searchParams])

  useEffect(() => {
    if (user && (step === 'email' || step === 'otp')) {
      setStep('new-password')
    }
  }, [user, step])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data.error || 'Failed to send verification code')
      } else {
        setSuccess('Verification code sent! Please check your email.')
        setStep('otp')
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'recovery',
      })
      if (error) {
        setError(
          error.message?.includes('expired') || error.message?.includes('invalid')
            ? 'Invalid or expired verification code. Please request a new one.'
            : error.message || 'Invalid verification code. Please try again.',
        )
      } else {
        setSuccess('Code verified! Please enter your new password.')
        setStep('new-password')
      }
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!passwordMeetsPolicy(newPassword)) {
      setError(passwordPolicyErrorMessage())
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setError(error.message || 'Failed to update password')
      } else {
        setSuccess('Password updated successfully! Redirecting to login...')
        setTimeout(() => router.push('/login'), 2000)
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
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
              href="/login"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white border border-white/35 bg-white/10 shadow-sm hover:bg-white/20 transition-colors"
              aria-label="Back to login"
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
            Reset your password securely and regain access to your bidding portal account.
          </h2>
          <p className="text-sm md:text-base text-teal-100/95 max-w-md leading-relaxed">
            Verify your email with a one-time code, then set a new password to continue your workflow.
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

      {/* Right: reset form */}
      <div className="order-1 lg:order-2 flex flex-col justify-center bg-white px-8 pb-8 pt-5 md:px-10 md:pb-10 md:pt-6 lg:px-12 lg:pb-10 lg:pt-8 xl:px-20 2xl:px-28 lg:min-h-full">
        <form
          onSubmit={step === 'email' ? handleEmailSubmit : step === 'otp' ? handleOTPSubmit : handlePasswordSubmit}
          className="mx-auto w-full max-w-md lg:max-w-lg xl:max-w-xl space-y-5"
        >
          <div className="space-y-4">
            {step === 'email' && (
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Reset your password</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Enter your account email to receive a verification code.
                </p>
              </div>
            )}
            {step === 'otp' && (
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Enter verification code</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Check your inbox and enter the 6-digit code.
                </p>
              </div>
            )}
            {step === 'new-password' && (
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Create new password</h1>
                <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                  Choose a strong password to secure your account.
                </p>
              </div>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">{success}</div>}

          {step === 'email' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                required
                placeholder="you@yourcompany.com"
                disabled={loading}
              />
            </div>
          )}

          {step === 'otp' && (
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1.5">Verification Code</label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className={`${inputClass} text-center text-2xl tracking-[0.35em] font-mono py-3`}
                required
                placeholder="000000"
                maxLength={6}
                disabled={loading}
              />
              <p className="text-sm text-gray-500 mt-2 text-center">Enter the verification code from your email.</p>
            </div>
          )}

          {step === 'new-password' && (
            <>
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                    required
                    disabled={loading}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-md"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <PasswordRequirements password={newPassword} columns={2} className="mt-3" />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                    required
                    disabled={loading}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-md"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#317070] text-white font-semibold shadow-md hover:bg-[#285e5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : step === 'email' ? 'Send Verification Code' : step === 'otp' ? 'Verify Code' : 'Update Password'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                if (step === 'otp') {
                  setStep('email')
                  setOtp('')
                } else if (step === 'new-password') {
                  setStep('otp')
                  setNewPassword('')
                  setConfirmPassword('')
                } else {
                  router.push('/login')
                }
              }}
              className="text-[#317070] hover:text-[#285e5e] font-medium transition-colors"
            >
              {step === 'email' ? 'Back to login' : 'Back'}
            </button>
          </div>

          <div className="pt-6 border-t border-gray-100 text-center text-sm text-gray-600">
            <Link href="/login" className="text-[#317070] hover:text-[#285e5e] font-semibold">Return to login</Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}

