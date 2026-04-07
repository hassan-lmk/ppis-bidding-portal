'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { X, ShoppingCart, Trash2, CreditCard, User, LogIn, Mail, Wallet, Building2, Lock, Shield, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCart } from '../lib/cart-context'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { businessEmailErrorMessage, isBusinessEmail } from '../lib/business-email'
import { PASSWORD_MAX_LENGTH, passwordMeetsPolicy, passwordPolicyErrorMessage } from '../lib/password-policy'
import PasswordRequirements from './PasswordRequirements'
// import { purchaseArea } from '../lib/bidding-api'
const BACKEND_URL = ''

interface CartModalProps {
  isOpen: boolean
  onClose: () => void
  onPaymentSuccess: () => void
}

/* ─── Inline Toast Component ─── */
function InlineToast({ message, type, onDismiss }: { message: string; type: 'error' | 'warning' | 'info'; onDismiss: () => void }) {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }
  const icons = {
    error: <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />,
    warning: <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    info: <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />,
  }

  return (
    <div className={`${styles[type]} border rounded-xl p-4 mb-4 animate-fade-in-up`}>
      <div className="flex items-start gap-3">
        {icons[type]}
        <p className="text-sm flex-1">{message}</p>
        <button onClick={onDismiss} className="text-current opacity-50 hover:opacity-100 transition-opacity">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ─── Checkout Stepper ─── */
function CheckoutStepper({ currentStep, isLoggedIn }: { currentStep: string; isLoggedIn: boolean }) {
  const steps = isLoggedIn
    ? [
        { key: 'payment', label: 'Review & Pay', icon: CreditCard },
      ]
    : [
        { key: 'auth', label: 'Account', icon: User },
        { key: 'otp', label: 'Verify', icon: Mail },
        { key: 'payment', label: 'Payment', icon: CreditCard },
      ]

  if (isLoggedIn) return null // No stepper needed when logged in

  const currentIdx = steps.findIndex(s => s.key === currentStep)

  return (
    <div className="flex items-center justify-center mb-6 px-2">
      {steps.map((step, i) => {
        const Icon = step.icon
        const isActive = i === currentIdx
        const isComplete = i < currentIdx
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isComplete
                  ? 'bg-teal-600 text-white'
                  : isActive
                  ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                  : 'bg-gray-100 text-gray-400'
              }`}>
                {isComplete ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[10px] mt-1.5 font-medium transition-colors ${
                isActive ? 'text-teal-700' : isComplete ? 'text-teal-600' : 'text-gray-400'
              }`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-12 sm:w-16 h-0.5 mx-2 rounded-full overflow-hidden bg-gray-200 mb-4">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all duration-500"
                  style={{ width: isComplete ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


export default function CartModal({ isOpen, onClose, onPaymentSuccess }: CartModalProps) {
  const { items, removeFromCart, updateQuantity, clearCart, getTotalPrice, getTotalItems } = useCart()
  const { user, signUp, signIn } = useAuth()
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [isLoginMode, setIsLoginMode] = useState(false) // Toggle between signup and login
  const [showOTP, setShowOTP] = useState(false) // Show OTP verification step
  const [otpToken, setOtpToken] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [currentStep, setCurrentStep] = useState<'auth' | 'otp' | 'onboarding' | 'payment'>('auth')
  // Default payment method - PayFast handles all payment options
  const selectedPaymentMethod: 'credit_card' | 'mobile_wallet' | 'bank_account' | 'raast' = 'credit_card'
  // Inline error message instead of alert()
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'error' | 'warning' | 'info' } | null>(null)

  const showToast = (text: string, type: 'error' | 'warning' | 'info' = 'error') => {
    setToastMessage({ text, type })
    // Auto-dismiss after 8 seconds
    setTimeout(() => setToastMessage(null), 8000)
  }
  
  // Check user onboarding status when user changes
  useEffect(() => {
    const checkUserStatus = async () => {
      if (!user) {
        // If no user, show auth step
        setCurrentStep('auth')
        return
      }
      
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('onboarding_completed, user_type, status')
          .eq('id', user.id)
          .single()
        
        if (profile) {
          // If onboarding not completed, redirect to onboarding page (not in cart)
          if (profile.onboarding_completed !== true) {
            router.push('/onboarding')
            return
          }
          setCurrentStep('payment')
        } else {
          // No profile yet, show auth
          setCurrentStep('auth')
        }
      } catch (error) {
        console.error('Error checking user status:', error)
        setCurrentStep('auth')
      }
    }
    
    checkUserStatus()
  }, [user])

  if (!isOpen) return null

  // Handle signup for bidding company
  const handleBiddingCompanySignup = async () => {
    if (formData.password !== formData.confirmPassword) {
      showToast('Passwords do not match. Please check and try again.')
      return
    }
    if (!isBusinessEmail(formData.email)) {
      showToast(businessEmailErrorMessage())
      return
    }
    if (!passwordMeetsPolicy(formData.password)) {
      showToast(passwordPolicyErrorMessage())
      return
    }

    setProcessing(true)
    try {
      // Sign up - user_type will be set during onboarding
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      })
      
      if (error) {
        if (error.message.includes('already registered')) {
          showToast('This email is already registered. Please use the "Login" option instead.', 'warning')
          setIsLoginMode(true)
        } else {
          showToast(error.message)
        }
        setProcessing(false)
        return
      }
      
      // Store email for OTP verification
      sessionStorage.setItem('pending_verification_email', formData.email)
      
      // Move to OTP step
      setCurrentStep('otp')
      setShowOTP(true)
    } catch (error) {
      console.error('Signup error:', error)
      showToast('Signup failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }
  
  // Handle OTP verification
  const handleOTPVerification = async () => {
    if (!otpToken.trim()) {
      showToast('Please enter the OTP code', 'warning')
      return
    }
    
    const email = sessionStorage.getItem('pending_verification_email') || formData.email
    if (!email) {
      showToast('Email address not found. Please start over.')
      return
    }
    
    setProcessing(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email,
        token: otpToken,
        type: 'email'
      })
      
      if (error) {
        showToast(error.message)
        setProcessing(false)
        return
      }
      
      // Clear session storage
      sessionStorage.removeItem('pending_verification_email')
      
      // Wait for session to sync
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Redirect to onboarding page (account type selection happens there)
      router.push('/onboarding')
      onClose()
    } catch (error) {
      console.error('OTP verification error:', error)
      showToast('OTP verification failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }
  

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) return

    setProcessing(true)
    setToastMessage(null)
    try {
      // If user is not logged in, authenticate them first
      if (!user) {
        if (isLoginMode) {
          // Login existing user
          const signInResult = await signIn(formData.email, formData.password)
          if (signInResult.error) {
            throw new Error('Invalid email or password. Please try again.')
          }
        } else {
          // For new bidding company users, handle signup flow
          await handleBiddingCompanySignup()
          return // Will continue after OTP and onboarding
        }
        
        // Small delay to ensure auth state is updated
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      // Check if user needs onboarding (for bidding company)
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id || user?.id
      if (!userId) {
        throw new Error('Not authenticated. Please login and try again.')
      }
      
      // Check onboarding and approval status
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed, user_type, status')
        .eq('id', userId)
        .single()
      
      if (profile?.onboarding_completed !== true) {
        showToast('Please complete your profile onboarding first.', 'warning')
        router.push('/onboarding')
        setProcessing(false)
        return
      }

      // Start PayFast checkout session via backend
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again and retry.')
      }

      const payload = {
        userId,
        cart: items.map(it => ({ areaId: it.area.id, quantity: Math.max(1, it.quantity) })),
        paymentMethod: selectedPaymentMethod
      }
      const resp = await fetch(`/api/payfast/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload)
      })
      if (!resp.ok) {
        let serverMsg = 'Failed to create checkout session'
        try {
          const err = await resp.json()
          serverMsg = err?.error || serverMsg
        } catch {}
        throw new Error(serverMsg)
      }
      const data = await resp.json() as { actionUrl: string, form: Record<string,string> }

      // Build and auto-submit the PayFast form
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = data.actionUrl
      form.style.display = 'none'
      Object.entries(data.form).forEach(([k, v]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = k
        input.value = String(v)
        form.appendChild(input)
      })
      document.body.appendChild(form)
      form.submit()
    } catch (error) {
      console.error('Payment error:', error)
      showToast(error instanceof Error ? error.message : 'Payment failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[3000] p-4 animate-fade-in-up" style={{ animationDuration: '0.3s' }}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200/50">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mr-3">
                <ShoppingCart className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Shopping Cart</h3>
                <p className="text-xs text-gray-500">{getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={processing}
              className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-all disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Inline Toast */}
          {toastMessage && (
            <InlineToast
              message={toastMessage.text}
              type={toastMessage.type}
              onDismiss={() => setToastMessage(null)}
            />
          )}

          {items.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
                <ShoppingCart className="w-10 h-10 text-gray-300" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h4>
              <p className="text-gray-500 text-sm">Add bidding documents from the map to get started.</p>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className="space-y-3 mb-6">
                {items.map((item) => (
                  <div key={item.area.id} className="group bg-gray-50 hover:bg-gray-100/80 rounded-xl p-4 transition-colors border border-transparent hover:border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-base font-semibold text-gray-900 truncate">{item.area.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Code: {item.area.code}</p>
                        {item.area.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-1">{item.area.description}</p>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-4 ml-4">
                        {/* Price */}
                        <div className="text-right">
                          <div className="text-lg font-bold text-teal-600">
                            ${item.area.price.toFixed(2)}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeFromCart(item.area.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          disabled={processing}
                          title="Remove from cart"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-4 mb-6 border border-teal-100">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm text-teal-700 font-medium">Order Total</span>
                    <p className="text-xs text-teal-600/70 mt-0.5">{getTotalItems()} {getTotalItems() === 1 ? 'document' : 'documents'}</p>
                  </div>
                  <span className="text-2xl font-bold text-teal-700">${getTotalPrice().toFixed(2)} <span className="text-sm font-normal text-teal-600/60">USD</span></span>
                </div>
              </div>

              {/* Checkout Stepper */}
              <CheckoutStepper currentStep={currentStep} isLoggedIn={!!user} />

              {/* OTP Verification Step */}
              {currentStep === 'otp' && showOTP && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6 animate-fade-in-up">
                  <div className="flex items-center mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mr-3">
                      <Mail className="w-4 h-4 text-blue-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900">Verify Your Email</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    We sent a verification code to <strong>{sessionStorage.getItem('pending_verification_email') || formData.email}</strong>. Please enter the code below.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Verification Code
                      </label>
                      <input
                        type="text"
                        value={otpToken}
                        onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent text-center text-2xl tracking-widest"
                        placeholder="000000"
                        maxLength={6}
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleOTPVerification}
                      disabled={processing || otpToken.length !== 6}
                      className="w-full py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {processing ? 'Verifying...' : 'Verify Email'}
                    </button>
                  </div>
                </div>
              )}


              {/* Payment Form - Show for payment step OR if user is logged in and not in OTP step */}
              {(currentStep === 'payment' || (!showOTP && user)) && (
                <form onSubmit={handlePayment} className="space-y-4">
                {/* Show authentication fields only if user is not logged in and in auth step */}
                {!user && currentStep === 'auth' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-base font-semibold text-gray-900 flex items-center">
                        {isLoginMode ? (
                          <>
                            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center mr-2">
                              <LogIn className="w-4 h-4 text-teal-600" />
                            </div>
                            Login to Your Account
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center mr-2">
                              <User className="w-4 h-4 text-teal-600" />
                            </div>
                            Create Your Account
                          </>
                        )}
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginMode(!isLoginMode)
                          setFormData({ email: '', password: '', confirmPassword: '' })
                          setToastMessage(null)
                        }}
                        className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {isLoginMode ? 'Need an account? Sign up' : 'Already have an account? Login'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Email */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-shadow"
                          placeholder="john@example.com"
                          required
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                          Password
                        </label>
                        <input
                          type="password"
                          value={formData.password}
                          onChange={(e) =>
                            setFormData(prev => ({
                              ...prev,
                              password: isLoginMode
                                ? e.target.value
                                : e.target.value.slice(0, PASSWORD_MAX_LENGTH),
                            }))
                          }
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-shadow"
                          placeholder={
                            isLoginMode ? 'Enter your password' : 'Create a strong password'
                          }
                          required
                          maxLength={isLoginMode ? undefined : PASSWORD_MAX_LENGTH}
                        />
                      </div>

                      {!isLoginMode && (
                        <PasswordRequirements password={formData.password} className="pl-0.5" />
                      )}

                      {/* Confirm Password - Only for signup */}
                      {!isLoginMode && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            Confirm Password
                          </label>
                          <input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) =>
                              setFormData(prev => ({
                                ...prev,
                                confirmPassword: e.target.value.slice(0, PASSWORD_MAX_LENGTH),
                              }))
                            }
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-600 focus:border-transparent transition-shadow"
                            placeholder="Confirm your password"
                            required
                            maxLength={PASSWORD_MAX_LENGTH}
                          />
                        </div>
                      )}

                      <p className="text-xs text-gray-500">
                        {isLoginMode 
                          ? 'Login to complete your purchase' 
                          : 'Create an account to access your purchased documents anytime'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Show user info if logged in */}
                {user && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mr-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          Logged in as {user.email}
                        </p>
                        <p className="text-xs text-green-600">
                          Purchase will be linked to this account
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method Information */}
                <div className="border-t border-gray-200 pt-5">
                  <h4 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center mr-2">
                      <CreditCard className="w-4 h-4 text-teal-600" />
                    </div>
                    Payment Options
                  </h4>
                  <p className="text-sm text-gray-600 mb-4">
                    All payments are processed securely through PayFast. You will be redirected to choose from:
                  </p>
                  
                  {/* Available Payment Methods Display */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {/* Credit/Debit Cards */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 hover:shadow-sm transition-all text-center">
                      <CreditCard className="w-5 h-5 text-teal-600 mx-auto mb-2" />
                      <div className="text-xs font-medium text-gray-900 mb-1.5">Card</div>
                      <div className="flex items-center justify-center space-x-1.5">
                        <Image src="/Mastercard-logo.svg.png" alt="Mastercard" width={28} height={18} className="h-4 w-auto object-contain" />
                        <Image src="/visa-eps-vector-logo.png" alt="Visa" width={36} height={18} className="h-4 w-auto object-contain" />
                      </div>
                    </div>

                    {/* Mobile Wallets */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 hover:shadow-sm transition-all text-center">
                      <Wallet className="w-5 h-5 text-teal-600 mx-auto mb-2" />
                      <div className="text-xs font-medium text-gray-900 mb-1.5">Mobile Wallet</div>
                      <div className="text-[10px] text-gray-500 leading-tight">Easypaisa, JazzCash</div>
                    </div>

                    {/* Bank Account */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 hover:shadow-sm transition-all text-center">
                      <Building2 className="w-5 h-5 text-teal-600 mx-auto mb-2" />
                      <div className="text-xs font-medium text-gray-900 mb-1.5">Bank Transfer</div>
                      <div className="text-[10px] text-gray-500 leading-tight">Direct transfer</div>
                    </div>

                    {/* Raast */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-teal-300 hover:shadow-sm transition-all text-center">
                      <div className="h-5 flex items-center justify-center mb-2">
                        <Image src="/Raast_Logo.svg" alt="Raast" width={40} height={20} className="h-5 w-auto object-contain" />
                      </div>
                      <div className="text-xs font-medium text-gray-900 mb-1.5">Raast</div>
                      <div className="text-[10px] text-gray-500 leading-tight">Instant payment</div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3.5">
                    <p className="text-xs text-blue-800 mb-1.5">
                      <strong>Note:</strong> You will be redirected to PayFast to complete your payment securely.
                    </p>
                    <p className="text-xs text-blue-700">
                      All payments are non-refundable. Please review our{' '}
                      <Link href="/refund-policy" className="underline underline-offset-2 hover:text-blue-900 font-semibold" target="_blank">
                        refund policy
                      </Link>{' '}
                      before proceeding.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={processing}
                    className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    Go back
                  </button>
                  <button
                    type="submit"
                    disabled={
                      processing ||
                      (!user &&
                        currentStep === 'auth' &&
                        !isLoginMode &&
                        (!passwordMeetsPolicy(formData.password) ||
                          formData.password !== formData.confirmPassword))
                    }
                    className={`flex items-center justify-center px-7 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      processing
                        ? 'animate-btn-processing text-white shadow-lg'
                        : 'bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {processing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2" />
                        Redirecting to PayFast...
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        Secure Checkout — ${getTotalPrice().toFixed(2)}
                      </>
                    )}
                  </button>
                </div>

                {/* Trust footer */}
                <div className="flex items-center justify-center gap-4 mt-3 pb-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <Shield className="w-3 h-3" />
                    <span>256-bit SSL</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <Lock className="w-3 h-3" />
                    <span>Secure Payment</span>
                  </div>
                </div>
              </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
