'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import Image from 'next/image'

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#317070]/25 focus:border-[#317070] transition-shadow disabled:opacity-60'

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
    <div className="min-h-dvh lg:h-dvh lg:max-h-dvh lg:overflow-hidden bg-slate-100 w-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-1 min-h-0">
      {/* Left: visual panel */}
      <div className="relative order-2 lg:order-1 min-h-0 max-lg:min-h-[min(100dvh,520px)] overflow-hidden flex flex-col px-8 pt-6 pb-0 md:px-10 md:pt-8 md:pb-0 lg:pl-12 lg:pr-0 lg:pt-10 lg:pb-0 xl:pl-16 xl:pr-0 xl:pt-12 xl:pb-0 text-white bg-gradient-to-br from-[#317070] via-teal-700 to-teal-900">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Ccircle cx='8' cy='8' r='1.5'/%3E%3Ccircle cx='30' cy='8' r='1.5'/%3E%3Ccircle cx='52' cy='8' r='1.5'/%3E%3Ccircle cx='8' cy='30' r='1.5'/%3E%3Ccircle cx='30' cy='30' r='1.5'/%3E%3Ccircle cx='52' cy='30' r='1.5'/%3E%3Ccircle cx='8' cy='52' r='1.5'/%3E%3Ccircle cx='30' cy='52' r='1.5'/%3E%3Ccircle cx='52' cy='52' r='1.5'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative z-10 space-y-4 shrink-0">
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
          <h2 className="text-2xl md:text-3xl font-bold leading-tight max-w-2xl">
            Access purchased documents, submit bid applications, and manage your complete bidding workflow.
          </h2>
          <p className="text-sm md:text-base text-teal-100/95 max-w-md leading-relaxed">
            Sign in with your registered company account to continue in the PPIS bidding portal.
          </p>
        </div>

        <div className="relative z-10 mt-6 flex min-h-0 flex-1 basis-0 w-full flex-col items-center justify-end">
          <div className="relative min-h-0 flex-1 basis-0 w-full max-w-full">
            <Image
              src="/images/signup-mockup-image.png"
              alt="Bidding portal preview"
              fill
              className="object-contain object-[center_bottom]"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority={false}
            />
          </div>
        </div>
      </div>

      {/* Right: login form */}
      <div className="order-1 lg:order-2 flex flex-col justify-center bg-white p-6 md:p-8 lg:p-10 xl:px-16 2xl:px-24 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden">
        <div className="mx-auto w-full max-w-md lg:max-w-lg xl:max-w-xl space-y-5 py-2">
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                Welcome back
              </h1>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Sign in to continue to your bidding dashboard.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email or Username
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="Enter your email or username"
                className={inputClass}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-md"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="mt-2 text-right">
                <Link href="/reset-password" className="text-sm text-[#317070] hover:text-[#285e5e] font-medium">
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#317070] text-white font-semibold shadow-md hover:bg-[#285e5e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="pt-6 border-t border-gray-100 space-y-3 text-center text-sm text-gray-600">
            <p>
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-[#317070] hover:text-[#285e5e] font-semibold">
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
      <div className="h-dvh max-h-dvh bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
