'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, XCircle, Loader2, Receipt, ArrowRight, ShoppingBag, Download, Home } from 'lucide-react'
import { useCart } from '../../lib/cart-context'
import { generatePaymentReceipt, PaymentReceiptData } from '../../lib/receipt-generator'
import Link from 'next/link'

function PayfastReturnContent() {
  const search = useSearchParams()
  const router = useRouter()
  const { removeFromCart, items } = useCart()
  const basketId = search.get('basket_id') || ''
  const initialStatus = (search.get('status') || 'pending') as 'success' | 'failed' | 'pending'
  // Always start with pending/loading to verify actual order status
  const [status, setStatus] = useState<'success' | 'failed' | 'pending'>('pending')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('Verifying your payment...')
  const [cartCleared, setCartCleared] = useState(false)
  const [orderData, setOrderData] = useState<any>(null)
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  const title = useMemo(() => {
    if (status === 'success') return 'Payment Successful'
    if (status === 'failed') return 'Payment Failed'
    return 'Processing Payment'
  }, [status])

  useEffect(() => {
    let mounted = true
    async function pollOrder() {
      if (!basketId) {
        setLoading(false)
        setStatus('failed')
        setMessage('Missing basket reference')
        return
      }
      // poll orders table for current user
      for (let i = 0; i < 10; i++) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (mounted) {
            setLoading(false)
            setStatus('failed')
            setMessage('Please log in to verify your payment status.')
          }
          break
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
            setMessage('Unable to verify order status. Please check Bidding Portal.')
          }
          break
        }
        if (data?.status === 'paid') {
          if (!mounted) return
          setStatus('success')
          setLoading(false)
          setMessage('Your purchase is confirmed. You can now download your documents.')
          
          // Fetch full order data for receipt
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
            
            if (fullOrderData) {
              setOrderData(fullOrderData)
            }
          } catch (err) {
            console.error('Error fetching order data:', err)
          }
          
          // Clear purchased items from cart
          if (!cartCleared) {
            try {
              // Fetch order items for this order
              const { data: orderData } = await supabase
                .from('orders')
                .select('id')
                .eq('basket_id', basketId)
                .eq('user_id', user.id)
                .maybeSingle()
              
              if (orderData?.id) {
                const { data: orderItems } = await supabase
                  .from('order_items')
                  .select('area_id')
                  .eq('order_id', orderData.id)
                
                if (orderItems && orderItems.length > 0) {
                  // Remove each purchased area from cart
                  orderItems.forEach(item => {
                    removeFromCart(item.area_id)
                  })
                  setCartCleared(true)
                }
              }
            } catch (err) {
              console.error('Error clearing cart:', err)
            }
          }
          return
        }
        if (data?.status === 'failed') {
          if (!mounted) return
          setStatus('failed')
          setLoading(false)
          setMessage('The payment failed or was cancelled.')
          return
        }
        // Still pending - continue polling
        await new Promise(r => setTimeout(r, 1500))
      }
      // If we've exhausted all polling attempts and still pending
      if (mounted) {
        setLoading(false)
        // If initial status was success but order not confirmed, show pending message
        if (initialStatus === 'success') {
          setMessage('Payment received but confirmation is pending. Please check Bidding Portal in a few moments.')
        } else {
          setMessage('Waiting for confirmation. If this takes long, check Bidding Portal.')
        }
      }
    }
    pollOrder()
    return () => { mounted = false }
  }, [basketId, cartCleared, removeFromCart, initialStatus])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50">
      {/* Simple Header for Bidding Portal */}
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/bidding-portal" className="flex items-center space-x-2">
              <img 
                src="/images/PPIS-logo-bg.png" 
                alt="PPIS Logo" 
                className="h-10 w-auto"
              />
              <span className="font-semibold text-gray-900 hidden sm:inline">Bidding Portal</span>
            </Link>
            <Link 
              href="https://ppisonline.com" 
              className="text-sm text-gray-600 hover:text-teal-600 flex items-center gap-1"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Return to Website</span>
            </Link>
          </div>
        </div>
      </header>
      
      {/* Full Width Hero Banner */}
      <div className={`relative overflow-hidden ${
        status === 'success' 
          ? 'bg-gradient-to-r from-teal-500 via-teal-600 to-blue-600' 
          : status === 'failed'
          ? 'bg-gradient-to-r from-red-500 via-red-600 to-rose-600'
          : 'bg-gradient-to-r from-teal-500 via-teal-600 to-blue-600'
      }`}>
        <div className="absolute inset-0 bg-black/5"></div>
        <div className="relative px-4 sm:px-6 lg:px-8 py-16 md:py-20 lg:py-24">
          <div className="max-w-4xl mx-auto text-center">
              {loading ? (
                <div className="flex flex-col items-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 border-4 border-white/30 rounded-full"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-10 h-10 text-white animate-spin" />
                    </div>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    {title}
                  </h1>
                  <p className="text-teal-100 text-lg">
                    Verifying your payment...
                  </p>
                </div>
              ) : status === 'success' ? (
                <div className="flex flex-col items-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-teal-600" fill="currentColor" />
                    </div>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    Payment Successful!
                  </h1>
                  <p className="text-teal-100 text-lg">
                    Your transaction has been completed
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <XCircle className="w-12 h-12 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
                    Payment Failed
                  </h1>
                  <p className="text-red-100 text-lg">
                    We couldn't process your payment
                  </p>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 md:mt-12">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-8 pt-12 md:pt-16 pb-8 md:pb-10">
            {!loading && (
              <>
                {/* Basket ID Card */}
                {basketId && (
                  <div className="mb-8 bg-gradient-to-r from-teal-50 to-blue-50 rounded-xl p-6 border border-teal-100">
                    <div className="flex items-center space-x-3 mb-2">
                      <Receipt className="w-5 h-5 text-teal-600" />
                      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                        Order Reference
                      </h3>
                    </div>
                    <p className="text-xl font-mono font-semibold text-gray-900">
                      {basketId}
                    </p>
                  </div>
                )}

                {/* Message */}
                <div className={`mb-8 p-6 rounded-xl ${
                  status === 'success'
                    ? 'bg-green-50 border border-green-200'
                    : status === 'failed'
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}>
                  <p className={`text-base md:text-lg ${
                    status === 'success'
                      ? 'text-green-800'
                      : status === 'failed'
                      ? 'text-red-800'
                      : 'text-blue-800'
                  }`}>
                    {message}
                  </p>
                </div>

                {/* Action Buttons */}
                {status === 'success' && (
                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <button
                      onClick={async () => {
                        if (!orderData) return
                        setDownloadingReceipt(true)
                        try {
                          const { data: { user } } = await supabase.auth.getUser()
                          
                          // Fetch user profile for company name and address
                          // Use same approach as BiddingPortalLayout: try 'id' first, then 'user_id' as fallback
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
                                // If query with 'id' fails, try with 'user_id' as fallback
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
                      }}
                      disabled={downloadingReceipt || !orderData}
                      className="w-full sm:w-auto bg-white border-2 border-teal-500 text-teal-700 font-semibold py-4 px-8 rounded-xl hover:bg-teal-50 hover:border-teal-600 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloadingReceipt ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          <span>Download Receipt</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => router.push('/bidding-portal')}
                      className="w-full sm:w-auto group relative overflow-hidden bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <ShoppingBag className="w-5 h-5" />
                      <span>Go to Bidding Portal</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                )}

                {status === 'failed' && (
                  <button
                    onClick={() => router.push('/bidding-portal')}
                    className="w-full md:w-auto group relative overflow-hidden bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <span>Try Again</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                )}

                {status === 'pending' && (
                  <div className="text-center">
                    <p className="text-gray-600 mb-4">
                      If this takes longer than expected, please check your Bidding Portal.
                    </p>
                    <button
                      onClick={() => router.push('/bidding-portal')}
                      className="inline-flex items-center space-x-2 text-teal-600 hover:text-teal-700 font-semibold"
                    >
                      <span>Check Bidding Portal</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}

            {loading && (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">
                  Please wait while we verify your payment...
                </p>
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-teal-600 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-teal-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-teal-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Additional Info Card */}
        {!loading && status === 'success' && (
          <div className="mt-6 bg-white/80 backdrop-blur-sm rounded-xl p-6 border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-600 text-center">
              <span className="font-semibold">Next Steps:</span> Your purchased documents are now available in your{' '}
              <button
                onClick={() => router.push('/bidding-portal')}
                className="text-teal-600 hover:text-teal-700 font-semibold underline"
              >
                Bidding Portal
              </button>
              {' '}where you can download them anytime.
            </p>
          </div>
        )}
      </div>
      
      {/* Footer spacing */}
      <div className="h-16"></div>
    </div>
  )
}

export default function PayfastReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-teal-200 rounded-full"></div>
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
