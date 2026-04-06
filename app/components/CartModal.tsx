'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { X, ShoppingCart, Trash2, CreditCard, User, LogIn, Mail, Wallet, Building2 } from 'lucide-react'
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
      alert('Passwords do not match.')
      return
    }
    if (!isBusinessEmail(formData.email)) {
      alert(businessEmailErrorMessage())
      return
    }
    if (!passwordMeetsPolicy(formData.password)) {
      alert(passwordPolicyErrorMessage())
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
          alert('This email is already registered. Please use the "Login" option instead.')
          setIsLoginMode(true)
        } else {
          alert(error.message)
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
      alert('Signup failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }
  
  // Handle OTP verification
  const handleOTPVerification = async () => {
    if (!otpToken.trim()) {
      alert('Please enter the OTP code')
      return
    }
    
    const email = sessionStorage.getItem('pending_verification_email') || formData.email
    if (!email) {
      alert('Email address not found. Please start over.')
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
        alert(error.message)
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
      alert('OTP verification failed. Please try again.')
    } finally {
      setProcessing(false)
    }
  }
  

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) return

    setProcessing(true)
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
        alert('Please complete your profile onboarding first.')
        router.push('/onboarding')
        setProcessing(false)
        return
      }

      // Start PayFast checkout session via backend
      const payload = {
        userId,
        cart: items.map(it => ({ areaId: it.area.id, quantity: Math.max(1, it.quantity) })),
        paymentMethod: selectedPaymentMethod
      }
      const resp = await fetch(`/api/payfast/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      alert('Payment failed: ' + (error instanceof Error ? error.message : 'Please try again.'))
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <ShoppingCart className="w-6 h-6 text-teal-600 mr-2" />
              <h3 className="text-2xl font-bold text-gray-900">Shopping Cart</h3>
              <span className="ml-2 text-sm text-gray-500">({getTotalItems()} items)</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
              disabled={processing}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h4 className="text-xl font-semibold text-gray-900 mb-2">Your cart is empty</h4>
              <p className="text-gray-600">Add some bidding documents to get started.</p>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className="space-y-4 mb-6">
                {items.map((item) => (
                  <div key={item.area.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-gray-900">{item.area.name}</h4>
                        <p className="text-sm text-gray-500">Code: {item.area.code}</p>
                        <p className="text-sm text-gray-600">{item.area.description}</p>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        {/* Price */}
                        <div className="text-right">
                          <div className="text-lg font-bold text-teal-600">
                            ${item.area.price.toFixed(2)}
                          </div>
                        </div>

                        {/* Remove Button */}
                        <button
                          onClick={() => removeFromCart(item.area.id)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                          disabled={processing}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="border-t border-gray-200 pt-4 mb-6">
                <div className="flex justify-between items-center text-xl font-bold">
                  <span>Total:</span>
                  <span className="text-teal-600">${getTotalPrice().toFixed(2)}</span>
                </div>
              </div>


              {/* OTP Verification Step */}
              {currentStep === 'otp' && showOTP && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center mb-4">
                    <Mail className="w-5 h-5 text-blue-600 mr-2" />
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
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent text-center text-2xl tracking-widest"
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
                      className="w-full py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                        {isLoginMode ? (
                          <>
                            <LogIn className="w-5 h-5 mr-2 text-teal-600" />
                            Login to Your Account
                          </>
                        ) : (
                          <>
                            <User className="w-5 h-5 mr-2 text-teal-600" />
                            Create Your Account
                          </>
                        )}
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginMode(!isLoginMode)
                          setFormData({ email: '', password: '', confirmPassword: '' })
                        }}
                        className="text-sm text-teal-600 hover:text-teal-700 font-medium"
                      >
                        {isLoginMode ? 'Need an account? Sign up' : 'Already have an account? Login'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      {/* Email */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent"
                          placeholder="john@example.com"
                          required
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
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
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent"
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
                          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 focus:border-transparent"
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
                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center">
                      <User className="w-5 h-5 text-green-600 mr-2" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          Logged in as: {user.email}
                        </p>
                        <p className="text-xs text-green-600">
                          Your purchase will be linked to this account
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Method Information */}
                <div className="border-t-2 border-gray-200 pt-4">
                  <h4 className="text-md font-semibold text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2 text-teal-600" />
                    Payment Information
                  </h4>
                  <p className="text-sm text-gray-600 mb-4">
                    All payments are processed securely through PayFast payment gateway. You will be redirected to complete your payment where you can choose from the following options:
                  </p>
                  
                  {/* Available Payment Methods Display */}
                  <div className="bg-teal-50 border-2 border-teal-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Credit/Debit Cards */}
                      <div className="flex items-center space-x-3">
                        <CreditCard className="w-5 h-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">Credit/Debit Card</div>
                          <div className="flex items-center space-x-2 mt-1">
                            <Image src="/Mastercard-logo.svg.png" alt="Mastercard" width={40} height={24} className="h-5 w-auto object-contain" />
                            <Image src="/visa-eps-vector-logo.png" alt="Visa" width={50} height={24} className="h-5 w-auto object-contain" />
                          </div>
                        </div>
                      </div>

                      {/* Mobile Wallets */}
                      <div className="flex items-center space-x-3">
                        <Wallet className="w-5 h-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">Mobile Wallet</div>
                          <div className="text-xs text-gray-600 mt-1">Easypaisa, Jazz Cash, Upaisa, Zindagi</div>
                        </div>
                      </div>

                      {/* Bank Account */}
                      <div className="flex items-center space-x-3">
                        <Building2 className="w-5 h-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">Bank Account</div>
                          <div className="text-xs text-gray-600 mt-1">Direct bank transfer</div>
                        </div>
                      </div>

                      {/* Raast */}
                      <div className="flex items-center space-x-3">
                        <CreditCard className="w-5 h-5 text-teal-600" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">Raast</div>
                          <div className="flex items-center mt-1">
                            <Image src="/Raast_Logo.svg" alt="Raast" width={60} height={40} className="h-6 w-auto object-contain" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 mb-2">
                      You will be redirected to PayFast payment gateway to complete your payment securely.
                    </p>
                    <p className="text-sm text-blue-800">
                      <strong>Please note:</strong> All payments are non-refundable. Please review our{' '}
                      <Link href="/refund-policy" className="underline hover:text-blue-900 font-semibold" target="_blank">
                        refund policy
                      </Link>{' '}
                      before proceeding.
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={processing}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
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
                    className="flex items-center px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Proceed to Checkout
                      </>
                    )}
                  </button>
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

