'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import PasswordRequirements from '../components/PasswordRequirements'
import { passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'

type Step = 'email' | 'otp' | 'new-password'

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
    <div className="relative min-h-screen flex items-center justify-center py-12 md:py-16">
      <div className="absolute inset-0 w-full h-full z-0">
        <img src="/images/Banner-2.webp" alt="Reset Password Banner" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      <div className="relative z-10 w-full flex items-center justify-center px-4">
        <form
          onSubmit={step === 'email' ? handleEmailSubmit : step === 'otp' ? handleOTPSubmit : handlePasswordSubmit}
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6"
        >
          <div className="text-center">
            {step === 'email' && (
              <>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Reset Your Password</h2>
                <p className="text-gray-500 mb-6">Enter your email to receive a verification code</p>
              </>
            )}
            {step === 'otp' && (
              <>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Enter Verification Code</h2>
                <p className="text-gray-500 mb-6">Check your email for the verification code</p>
              </>
            )}
            {step === 'new-password' && (
              <>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Create New Password</h2>
                <p className="text-gray-500 mb-6">Enter your new password below</p>
              </>
            )}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
          {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

          {step === 'email' && (
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                placeholder="you@example.com"
              />
            </div>
          )}

          {step === 'otp' && (
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                id="otp"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-center text-2xl tracking-widest"
                required
                placeholder="000000"
                maxLength={6}
              />
              <p className="text-sm text-gray-500 mt-2 text-center">Enter the verification code from your email</p>
            </div>
          )}

          {step === 'new-password' && (
            <>
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>
                <PasswordRequirements password={newPassword} className="mt-2" />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              className="text-teal-600 hover:text-teal-700 font-medium transition-colors"
            >
              {step === 'email' ? 'Back to login' : 'Back'}
            </button>
          </div>

          <div className="text-center">
            <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">Return to Login</Link>
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

