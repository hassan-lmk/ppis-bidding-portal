'use client'

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, XCircle, Loader2, Receipt, ArrowRight, ShoppingBag, Download, Home, Shield, Lock, AlertTriangle, RefreshCw, Mail } from 'lucide-react'
import { useCart } from '../../lib/cart-context'
import { generatePaymentReceipt, PaymentReceiptData } from '../../lib/receipt-generator'
import { downloadAreaDocument } from '../../lib/bidding-api'
import Link from 'next/link'

/* ─── Confetti Component ─── */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#14b8a6', '#0d9488', '#2dd4bf', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981']
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: `${Math.random() * 3}s`,
      duration: `${2.5 + Math.random() * 2}s`,
      size: `${6 + Math.random() * 8}px`,
      rotation: Math.random() * 360,
    }))
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: p.delay,
            animationDuration: `${p.duration}, 1s`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  )
}

/* ─── Animated Checkmark SVG ─── */
function AnimatedCheckmark() {
  return (
    <svg viewBox="0 0 52 52" className="w-20 h-20 md:w-24 md:h-24">
      <circle
        cx="26" cy="26" r="24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        className="animate-circle-draw"
        opacity="0.3"
      />
      <circle
        cx="26" cy="26" r="24"
        fill="rgba(255,255,255,0.15)"
        className="animate-scale-in"
      />
      <path
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 27l8 8 16-16"
        className="animate-check-draw"
      />
    </svg>
  )
}

/* ─── Verification Stepper ─── */
const VERIFICATION_STEPS = [
  { label: 'Connecting', description: 'Reaching payment gateway' },
  { label: 'Verifying', description: 'Validating transaction' },
  { label: 'Confirming', description: 'Updating order status' },
  { label: 'Complete', description: 'Payment confirmed' },
]

function VerificationStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-3">
        {VERIFICATION_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            {/* Step dot */}
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-500 ${
              i < currentStep
                ? 'bg-white text-teal-600'
                : i === currentStep
                ? 'bg-white/20 text-white animate-pulse-ring border-2 border-white'
                : 'bg-white/10 text-white/40 border border-white/20'
            }`}>
              {i < currentStep ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <span>{i + 1}</span>
              )}
            </div>
            {/* Connector line */}
            {i < VERIFICATION_STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 rounded-full overflow-hidden bg-white/15">
                <div
                  className="h-full bg-white/70 rounded-full transition-all duration-700 ease-out"
                  style={{ width: i < currentStep ? '100%' : '0%' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="text-center">
        <p className="text-white/90 text-sm font-medium">
          {VERIFICATION_STEPS[Math.min(currentStep, VERIFICATION_STEPS.length - 1)].description}
        </p>
      </div>
    </div>
  )
}

/* ─── Order Summary Table ─── */
function OrderSummary({ orderData }: { orderData: any }) {
  if (!orderData) return null

  const items = orderData.order_items || []
  const payment = Array.isArray(orderData.payments)
    ? orderData.payments[0]
    : orderData.payments

  return (
    <div className="animate-fade-in-up-delay-1">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-6 py-4 border-b border-teal-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" />
              <h3 className="font-semibold text-gray-900">Order Summary</h3>
            </div>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              Paid
            </span>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Order Reference & Transaction */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Order Reference</p>
              <p className="text-sm font-mono font-semibold text-gray-900">{orderData.basket_id}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Transaction ID</p>
              <p className="text-sm font-mono font-semibold text-gray-900">
                {payment?.transaction_id || orderData.txnid || '—'}
              </p>
            </div>
          </div>

          {/* Items Table */}
          {items.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Items Purchased</h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Block / Area</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-gray-900">
                            {item.areas?.name || `Area ${item.area_id?.substring(0, 8)}`}
                          </div>
                          {item.areas?.code && (
                            <div className="text-xs text-gray-500 mt-0.5">Code: {item.areas.code}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center text-gray-600">{item.quantity || 1}</td>
                        <td className="py-3 px-4 text-right font-medium text-gray-900">
                          ${Number(item.unit_price || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200">
            <span className="text-base font-semibold text-gray-700">Total Paid</span>
            <span className="text-2xl font-bold text-teal-600">
              ${Number(orderData.total_amount || 0).toFixed(2)}
              <span className="text-sm font-normal text-gray-500 ml-1">USD</span>
            </span>
          </div>

          {/* Payment date */}
          {(payment?.created_at || orderData.updated_at) && (
            <p className="text-xs text-gray-400 mt-3 text-right">
              Paid on {new Date(payment?.created_at || orderData.updated_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Content Component ─── */
function PayfastReturnContent() {
  const search = useSearchParams()
  const router = useRouter()
  const { removeFromCart } = useCart()
  const basketId = search.get('basket_id') || ''
  const initialStatus = (search.get('status') || 'pending') as 'success' | 'failed' | 'pending'

  const [status, setStatus] = useState<'success' | 'failed' | 'pending'>('pending')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('Verifying your payment...')
  const [cartCleared, setCartCleared] = useState(false)
  const [orderData, setOrderData] = useState<any>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)
  const [downloadingDocuments, setDownloadingDocuments] = useState(false)
  const [verificationStep, setVerificationStep] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)

  // Advance verification stepper during loading
  useEffect(() => {
    if (!loading) return
    const timers = [
      setTimeout(() => setVerificationStep(1), 1500),
      setTimeout(() => setVerificationStep(2), 4000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [loading])

  // Clear cart once on success
  useEffect(() => {
    if (status !== 'success' || cartCleared || !orderData) return
    const clearPurchasedItems = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('basket_id', basketId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (order?.id) {
          const { data: orderItems } = await supabase
            .from('order_items')
            .select('area_id')
            .eq('order_id', order.id)

          if (orderItems && orderItems.length > 0) {
            orderItems.forEach(item => removeFromCart(item.area_id))
            setCartCleared(true)
          }
        }
      } catch (err) {
        console.error('Error clearing cart:', err)
      }
    }
    clearPurchasedItems()
  }, [status, cartCleared, orderData, basketId, removeFromCart])

  // Main polling logic with exponential backoff
  useEffect(() => {
    let mounted = true
    async function pollOrder() {
      if (!basketId) {
        setLoading(false)
        setStatus('failed')
        setMessage('Missing basket reference. Please return to the portal.')
        return
      }

      // Immediate failure — no need to poll
      if (initialStatus === 'failed') {
        setLoading(false)
        setStatus('failed')
        setMessage('The payment was declined or cancelled by the gateway.')
        return
      }

      // Exponential backoff: 1s, 1.5s, 2s, 2.5s, 3s, 3s, 3s ... (max 20 attempts ≈ 45s)
      const MAX_ATTEMPTS = 20
      let delay = 1000

      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (!mounted) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) {
            setLoading(false)
            setStatus('failed')
            setMessage('Please log in to verify your payment status.')
          }
          return
        }

        const { data, error } = await supabase
          .from('orders')
          .select('status')
          .eq('basket_id', basketId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (error) {
          if (mounted) {
            setLoading(false)
            setStatus('failed')
            setMessage('Unable to verify order status. Please check your Bidding Portal.')
          }
          return
        }

        if (data?.status === 'paid') {
          if (!mounted) return
          setVerificationStep(3)

          // Short delay so the stepper animates to "Complete"
          await new Promise(r => setTimeout(r, 600))
          if (!mounted) return

          setStatus('success')
          setLoading(false)
          setMessage('Your purchase is confirmed! Documents are now available for download.')
          setShowConfetti(true)

          // Fetch full order data for summary + receipt
          try {
            const { data: fullOrderData } = await supabase
              .from('orders')
              .select(`
                *,
                order_items:order_items(
                  area_id,
                  quantity,
                  unit_price,
                  areas:areas(name, code)
                ),
                payments:payments(
                  transaction_id,
                  amount,
                  currency,
                  created_at
                )
              `)
              .eq('basket_id', basketId)
              .eq('user_id', user.id)
              .maybeSingle()

            if (fullOrderData && mounted) {
              setOrderData(fullOrderData)
            }
          } catch (err) {
            console.error('Error fetching order data:', err)
          }

          // Stop confetti after 5s
          setTimeout(() => mounted && setShowConfetti(false), 5000)
          return
        }

        if (data?.status === 'failed') {
          if (!mounted) return
          setStatus('failed')
          setLoading(false)
          setMessage('The payment was declined or cancelled.')
          return
        }

        // Still pending — wait with backoff
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay + 500, 3000)
      }

      // Exhausted attempts
      if (mounted) {
        setLoading(false)
        if (initialStatus === 'success') {
          setMessage('Payment received but confirmation is still processing. Please check your Bidding Portal in a few moments.')
        } else {
          setMessage('Verification is taking longer than expected. Please check your Bidding Portal.')
        }
      }
    }

    pollOrder()
    return () => { mounted = false }
  }, [basketId, initialStatus])

  // Receipt download handler
  const handleDownloadReceipt = useCallback(async () => {
    if (!orderData) return
    setDownloadingReceipt(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      let companyName: string | undefined
      let address: string | undefined
      if (user?.id) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('company_name, address')
            .eq('id', user.id)
            .single()

          if (!profileError && profile) {
            companyName = profile.company_name?.trim() || undefined
            address = profile.address?.trim() || undefined
          } else if (profileError) {
            const { data: profileAlt, error: profileAltError } = await supabase
              .from('user_profiles')
              .select('company_name, address')
              .eq('user_id', user.id)
              .maybeSingle()

            if (!profileAltError && profileAlt) {
              companyName = profileAlt.company_name?.trim() || undefined
              address = profileAlt.address?.trim() || undefined
            }
          }
        } catch (err) {
          console.error('Error fetching user profile:', err)
        }
      }

      const payment = orderData.payments?.[0] || orderData.payments
      const receiptData: PaymentReceiptData = {
        basketId: orderData.basket_id,
        transactionId: payment?.transaction_id || orderData.txnid || '',
        amount: orderData.total_amount,
        currency: payment?.currency || 'USD',
        paymentDate: payment?.created_at || orderData.updated_at || new Date().toISOString(),
        paymentMethod: 'PayFast',
        items: orderData.order_items?.map((item: any) => ({
          name: item.areas?.name || `Area ${item.area_id.substring(0, 8)}`,
          quantity: item.quantity || 1,
          price: item.unit_price || 0
        })) || [],
        customerName: user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0],
        customerEmail: user?.email,
        companyName,
        address,
        type: 'bidding_blocks'
      }
      await generatePaymentReceipt(receiptData)
    } catch (error) {
      console.error('Error generating receipt:', error)
      alert('Failed to generate receipt. Please try again.')
    } finally {
      setDownloadingReceipt(false)
    }
  }, [orderData])

  const handleDownloadBiddingDocuments = useCallback(async () => {
    if (!orderData?.order_items?.length) return

    setDownloadingDocuments(true)
    try {
      const uniqueAreaIds = Array.from(
        new Set(
          orderData.order_items
            .map((item: any) => item?.area_id)
            .filter(Boolean)
        )
      ) as string[]

      if (uniqueAreaIds.length === 0) {
        alert('No purchased bidding documents were found for this order.')
        return
      }

      for (const areaId of uniqueAreaIds) {
        const result = await downloadAreaDocument(areaId)

        if (result.signedUrl) {
          const link = document.createElement('a')
          link.href = result.signedUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          if (result.downloadName) {
            link.download = result.downloadName
          }
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          continue
        }

        if (result.blob) {
          const fileName = `bidding_document_${areaId.slice(0, 8)}.pdf`
          const url = window.URL.createObjectURL(result.blob)
          const link = document.createElement('a')
          link.href = url
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          continue
        }

        throw new Error('No download data received')
      }
    } catch (error) {
      console.error('Error downloading bidding documents:', error)
      alert('Failed to download bidding document(s). Please try again.')
    } finally {
      setDownloadingDocuments(false)
    }
  }, [orderData])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50/40">
      {showConfetti && <Confetti />}

      {/* Hero Banner */}
      <div className={`relative overflow-hidden transition-all duration-700 ${
        status === 'success'
          ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600'
          : status === 'failed'
          ? 'bg-gradient-to-r from-red-500 via-rose-500 to-red-600'
          : 'bg-gradient-to-r from-teal-500 via-teal-600 to-blue-600'
      }`}>
        {/* Decorative blurred orbs */}
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-black/5" />

        <div className="relative px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
          <div className="max-w-4xl mx-auto text-center">
            {loading ? (
              /* ─── Loading / Verifying State ─── */
              <div className="flex flex-col items-center animate-fade-in-up">
                <div className="relative mb-8">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center animate-pulse-ring">
                    <Shield className="w-10 h-10 md:w-12 md:h-12 text-white" />
                  </div>
                </div>
                <h1 className="text-2xl md:text-4xl font-bold text-white mb-3">
                  Verifying Your Payment
                </h1>
                <p className="text-white/80 text-base md:text-lg mb-10 max-w-md mx-auto">
                  Please wait while we securely verify your transaction with the payment gateway.
                </p>
                <VerificationStepper currentStep={verificationStep} />
              </div>
            ) : status === 'success' ? (
              /* ─── Success State ─── */
              <div className="flex flex-col items-center animate-fade-in-up">
                <div className="mb-6">
                  <AnimatedCheckmark />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                  Payment Successful!
                </h1>
                <p className="text-white/80 text-lg">
                  Your transaction has been completed and confirmed
                </p>
              </div>
            ) : (
              /* ─── Failed State ─── */
              <div className="flex flex-col items-center animate-fade-in-up">
                <div className="relative mb-6">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-white/15 rounded-full flex items-center justify-center backdrop-blur-sm animate-scale-in">
                    <XCircle className="w-12 h-12 md:w-14 md:h-14 text-white" strokeWidth={1.5} />
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                  Payment Failed
                </h1>
                <p className="text-red-100 text-lg">
                  We couldn&apos;t process your payment
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 md:-mt-8 relative z-10 pb-16">

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up">
            <div className="px-6 md:px-8 py-8 md:py-10">
              <div className="flex flex-col items-center text-center">
                <Lock className="w-6 h-6 text-teal-500 mb-3" />
                <p className="text-gray-600 mb-2 font-medium">
                  Securely verifying your payment...
                </p>
                <p className="text-sm text-gray-400 mb-6 max-w-sm">
                  This usually takes a few seconds. Please don&apos;t close this page.
                </p>
                {/* Skeleton items */}
                <div className="w-full max-w-md space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-4 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="h-full animate-shimmer" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Content */}
        {!loading && status === 'success' && (
          <>
            {/* Order Summary */}
            <OrderSummary orderData={orderData} />

            {/* Action Buttons */}
            <div className="mt-6 animate-fade-in-up-delay-2">
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 md:p-8">
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <button
                    onClick={handleDownloadBiddingDocuments}
                    disabled={downloadingDocuments || !orderData?.order_items?.length}
                    className="w-full sm:w-auto group relative overflow-hidden bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingDocuments ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Preparing Document(s)...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5 group-hover:animate-bounce" />
                        <span>Download Bidding Document(s)</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadReceipt}
                    disabled={downloadingReceipt || !orderData}
                    className="w-full sm:w-auto group bg-white border-2 border-teal-500 text-teal-700 font-semibold py-3.5 px-7 rounded-xl hover:bg-teal-50 hover:border-teal-600 hover:shadow-md transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {downloadingReceipt ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Generating Receipt...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5 group-hover:animate-bounce" />
                        <span>Download Receipt</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => router.push('/bidding-portal')}
                    className="w-full sm:w-auto group bg-white border-2 border-teal-500 text-teal-700 font-semibold py-3.5 px-7 rounded-xl hover:bg-teal-50 hover:border-teal-600 hover:shadow-md transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    <span>Go to Bidding Portal</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            </div>

            {/* Next Steps Card */}
            <div className="mt-6 animate-fade-in-up-delay-3">
              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl p-5 border border-teal-100">
                <p className="text-sm text-teal-800 text-center">
                  <span className="font-semibold">Next Steps:</span>{' '}
                  Your purchased documents are now available in your{' '}
                  <button
                    onClick={() => router.push('/bidding-portal')}
                    className="text-teal-600 hover:text-teal-700 font-semibold underline underline-offset-2"
                  >
                    Bidding Portal
                  </button>
                  {' '}where you can download them anytime. A confirmation email has been sent to your registered email address.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Failed Content */}
        {!loading && status === 'failed' && (
          <div className="animate-fade-in-up">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="px-6 md:px-8 py-8 md:py-10">
                {/* Error message card */}
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-red-800 font-medium mb-1">Payment could not be processed</p>
                      <p className="text-red-700 text-sm">{message}</p>
                    </div>
                  </div>
                </div>

                {/* Order ref if available */}
                {basketId && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="w-4 h-4 text-gray-500" />
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Order Reference</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-gray-900">{basketId}</p>
                  </div>
                )}

                {/* What to do */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
                  <h4 className="text-sm font-semibold text-blue-900 mb-2">What you can do:</h4>
                  <ul className="text-sm text-blue-800 space-y-2">
                    <li className="flex items-start gap-2">
                      <RefreshCw className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>Go back to the Bidding Portal and try the payment again</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>Ensure your payment method has sufficient funds and is enabled for online transactions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>
                        Contact support at{' '}
                        <a href="mailto:midrees@lmkr.com" className="font-semibold underline underline-offset-2 hover:text-blue-900">
                          midrees@lmkr.com
                        </a>
                        {' '}if the issue persists
                      </span>
                    </li>
                  </ul>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => router.push('/bidding-portal')}
                    className="w-full sm:w-auto group relative overflow-hidden bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    <span>Try Again</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <a
                    href="mailto:midrees@lmkr.com"
                    className="w-full sm:w-auto bg-white border-2 border-gray-200 text-gray-700 font-semibold py-3.5 px-7 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <Mail className="w-5 h-5" />
                    <span>Contact Support</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pending (timeout) Content */}
        {!loading && status === 'pending' && (
          <div className="animate-fade-in-up">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="px-6 md:px-8 py-8 md:py-10">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
                  <div className="flex items-start gap-3">
                    <Loader2 className="w-5 h-5 text-amber-500 mt-0.5 animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-amber-800 font-medium mb-1">Confirmation is still processing</p>
                      <p className="text-amber-700 text-sm">{message}</p>
                    </div>
                  </div>
                </div>

                {basketId && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="w-4 h-4 text-gray-500" />
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Order Reference</p>
                    </div>
                    <p className="text-sm font-mono font-semibold text-gray-900">{basketId}</p>
                  </div>
                )}

                <div className="text-center">
                  <button
                    onClick={() => router.push('/bidding-portal')}
                    className="inline-flex items-center space-x-2 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-3.5 px-7 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <span>Check Bidding Portal</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Footer */}
        <div className="mt-8 text-center animate-fade-in-up-delay-3">
          <div className="inline-flex items-center gap-2 text-xs text-gray-400">
            <Lock className="w-3.5 h-3.5" />
            <span>Secured by PayFast</span>
            <span className="mx-1">•</span>
            <Shield className="w-3.5 h-3.5" />
            <span>256-bit SSL Encryption</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PayfastReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-teal-200 rounded-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          </div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    }>
      <PayfastReturnContent />
    </Suspense>
  )
}
