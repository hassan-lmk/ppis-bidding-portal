'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import Image from 'next/image'

function LoginContent() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, signIn } = useAuth()
  
  // Check if user is already logged in (SSO from main site)
  useEffect(() => {
    if (!authLoading && user) {
      const redirectParam = searchParams.get('redirect')
      router.push(redirectParam || '/bidding-portal')
    }
  }, [user, authLoading, router, searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await signIn(identifier, password)

      if (error) {
        setError(error.message || 'Invalid credentials')
        setLoading(false)
        return
      }

      // Redirect after successful login
      // Use window.location.href for a full page reload to ensure auth state is properly initialized
      const redirectParam = searchParams.get('redirect')
      const redirectUrl = redirectParam || '/bidding-portal'
      window.location.href = redirectUrl
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center py-12 md:py-16">
      {/* Background Image */}
      <div className="absolute inset-0 w-full h-full z-0">
        <img src="/images/Banner-2.webp" alt="Banner" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Form */}
      <div className="relative z-10 w-full flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6">
          {/* Logo */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <Image
                src="/images/PPIS-logo-bg.png"
                alt="PPIS Logo"
                width={150}
                height={50}
                className="h-12 w-auto"
              />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Bidding Portal</h2>
            <p className="text-gray-500">Sign in to access the bidding portal</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                Email or Username
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="Enter your email or username"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg shadow-md hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="text-center pt-4 border-t border-gray-200 space-y-3">
            <p className="text-sm text-gray-600">
              Already logged in on the main site?{' '}
              <button
                onClick={() => {
                  // Try to refresh session from main site
                  window.location.reload()
                }}
                className="text-teal-600 hover:text-teal-700 font-medium"
              >
                Refresh Session
              </button>
            </p>
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-teal-600 hover:text-teal-700 font-medium">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
