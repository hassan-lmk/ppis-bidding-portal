'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getAuthCookie, setAuthCookie, clearAuthCookie } from './cross-domain-auth'

interface UserProfile {
  company_name?: string
  address?: string
  poc_contact_number?: string
  user_type?: string
  admin_approved?: boolean
  status?: string
  onboarding_completed?: boolean
  rejection_reason?: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
  adminChecked: boolean
  userProfile: UserProfile | null
  mustChangePassword: boolean
  checkPasswordChangeRequired: () => Promise<void>
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>
  signIn: (identifier: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  updatePassword: (newPassword: string) => Promise<{ error: any }>
  sendOTP: (email: string) => Promise<{ error: any; success?: boolean }>
  verifyOTP: (email: string, token: string) => Promise<{ error: any; success?: boolean }>
  setUserRole: (userId: string, role: 'admin' | 'user') => Promise<{ error: any }>
  getUserRole: (user: User | null) => Promise<string | null>
  refreshAdminStatus: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false) // Track if admin status has been checked
  const [cachedUserId, setCachedUserId] = useState<string | null>(null) // Track which user we checked
  const [isInitialized, setIsInitialized] = useState(false) // Track if auth has been initialized
  const [cacheLoaded, setCacheLoaded] = useState(false) // Track if we've tried loading from cache
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null) // Cache user profile data
  const [mustChangePassword, setMustChangePassword] = useState(false) // Track if password change is required
  const isSigningOutRef = useRef(false) // Track if we're in the process of signing out (use ref to avoid closure issues)

  // Try to load from localStorage or cross-domain cookie on mount
  useEffect(() => {
    const tryLoadFromCache = async () => {
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Checking for cached session...')
        }
        
        // First check if there's already a session in Supabase
        let { data: { session } } = await supabase.auth.getSession()
        
        // If no session, try to restore from cross-domain cookie (SSO from main site)
        if (!session) {
          console.log('🔍 No local session, checking for cross-domain auth cookie...')
          const cookieTokens = getAuthCookie()
          
          if (cookieTokens?.access_token && cookieTokens?.refresh_token) {
            console.log('🔑 Found cross-domain auth cookie, restoring session...')
            
            // Try to set the session using the tokens from the cookie
            const { data, error } = await supabase.auth.setSession({
              access_token: cookieTokens.access_token,
              refresh_token: cookieTokens.refresh_token
            })
            
            if (error) {
              console.error('Error restoring session from cookie:', error)
              // Cookie might be expired, clear it
              clearAuthCookie()
            } else if (data.session) {
              console.log('✅ Session restored from cross-domain cookie!')
              session = data.session
            }
          }
        }
        
        if (session?.user) {
          const cachedStatus = getAdminStatusFromCache(session.user.id)
          if (cachedStatus !== null) {
            console.log('🚀 Loading admin status from cache on mount')
            // Batch all state updates together to prevent multiple renders
            setUser(session.user)
            setSession(session)
            setIsAdmin(cachedStatus)
            setAdminChecked(true)
            setCachedUserId(session.user.id)
            setLoading(false)
            setIsInitialized(true)
            setCacheLoaded(true)
            return
          }
        }
        
        console.log('No cached session found, will initialize normally')
        setCacheLoaded(true)
      } catch (error) {
        console.error('Error loading from cache on mount:', error)
        setCacheLoaded(true)
      }
    }
    
    tryLoadFromCache()
  }, [])

  // Helper functions for localStorage caching
  const getAdminStatusFromCache = (userId: string): boolean | null => {
    try {
      const cached = localStorage.getItem(`admin_status_${userId}`)
      if (cached) {
        const { isAdmin, timestamp } = JSON.parse(cached)
        // Cache expires after 24 hours
        const isExpired = Date.now() - timestamp > 24 * 60 * 60 * 1000
        if (!isExpired) {
          console.log('Using cached admin status from localStorage:', isAdmin)
          return isAdmin
        } else {
          console.log('Cached admin status expired, will refresh')
          localStorage.removeItem(`admin_status_${userId}`)
        }
      }
    } catch (error) {
      console.error('Error reading admin status from cache:', error)
    }
    return null
  }

  const setAdminStatusToCache = (userId: string, isAdmin: boolean) => {
    try {
      localStorage.setItem(`admin_status_${userId}`, JSON.stringify({
        isAdmin,
        timestamp: Date.now()
      }))
      console.log('✅ Admin status cached to localStorage')
    } catch (error) {
      console.error('Error caching admin status:', error)
    }
  }

  const clearAdminStatusCache = (userId?: string) => {
    try {
      if (userId) {
        localStorage.removeItem(`admin_status_${userId}`)
      } else {
        // Clear all admin status caches
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('admin_status_')) {
            localStorage.removeItem(key)
          }
        })
      }
      console.log('✅ Admin status cache cleared')
    } catch (error) {
      console.error('Error clearing admin status cache:', error)
    }
  }

  // Function to check if user is admin (with caching)
  const checkAdminStatus = async (user: User | null, forceCheck: boolean = false) => {
    if (!user) {
      console.log('No user provided to checkAdminStatus')
      setIsAdmin(false)
      setAdminChecked(true)
      setCachedUserId(null)
      return false
    }

    // If we already checked admin status for THIS SPECIFIC user in this session and not forcing, use memory cache
    if (adminChecked && cachedUserId === user.id && !forceCheck) {
      console.log('Admin status already checked in this session, using memory cache:', isAdmin)
      return isAdmin
    }

    // Check localStorage cache first (persists across page reloads)
    if (!forceCheck) {
      const cachedStatus = getAdminStatusFromCache(user.id)
      if (cachedStatus !== null) {
        setIsAdmin(cachedStatus)
        setAdminChecked(true)
        setCachedUserId(user.id)
        return cachedStatus
      }
    }

    // If this is a different user, we need to check
    if (cachedUserId && cachedUserId !== user.id) {
      console.log('Different user detected, resetting admin status')
      setIsAdmin(false)
      setAdminChecked(false)
      setCachedUserId(null)
    }

    console.log('Checking admin status from database for user:', user.email)
    
    try {
      // Check user_type and other profile info from user_profiles table
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('user_type, admin_approved, status, onboarding_completed')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        // If profile does not exist, treat as non-admin and allow UI to progress
        if (error.code === 'PGRST116') {
          console.log('Profile not found; marking admin check complete to avoid spinner')
          setIsAdmin(false)
          setAdminChecked(true)
          setCachedUserId(user.id)
          setUserProfile(null)
          setAdminStatusToCache(user.id, false)
        } else {
          setIsAdmin(false)
          setAdminChecked(true)
          setCachedUserId(user.id)
          setUserProfile(null)
          setAdminStatusToCache(user.id, false)
        }
        return false
      }

      // Only admin users can access dashboard
      const isAdminUser = profile?.user_type === 'admin'
      setIsAdmin(isAdminUser)
      setAdminChecked(true)
      setCachedUserId(user.id)
      setUserProfile(profile || null) // Cache the full profile
      
      // Cache to localStorage
      setAdminStatusToCache(user.id, isAdminUser)
      
      console.log('✅ User admin status & profile checked, cached to memory & localStorage:', { 
        userId: user.id, 
        email: user.email, 
        userType: profile?.user_type, 
        isAdmin: isAdminUser 
      })
      
      return isAdminUser
    } catch (error) {
      console.error('Error checking admin status:', error)
      setIsAdmin(false)
      setAdminChecked(true)
      setCachedUserId(user.id)
      setAdminStatusToCache(user.id, false)
      return false
    }
  }

  useEffect(() => {
    // Only run initialization once and after cache check
    if (isInitialized || !cacheLoaded) {
      console.log('Auth already initialized or cache not loaded, skipping')
      return
    }

    let isInitialLoad = true
    let isMounted = true
    let loadingTimeout: NodeJS.Timeout

    console.log('🚀 Initializing auth provider...')

    // Safety timeout to prevent infinite loading
    loadingTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth loading timeout - forcing completion')
        setLoading(false)
        setAdminChecked(true)
      }
    }, 5000) // 5 second timeout for auth

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error getting session:', error)
          if (isMounted) {
            setSession(null)
            setUser(null)
            setIsAdmin(false)
            setAdminChecked(true)
            setLoading(false)
            setIsInitialized(true)
            clearTimeout(loadingTimeout)
          }
          return
        }

        if (isMounted) {
          setSession(session)
          setUser(session?.user ?? null)
        }
        
        if (session?.user && isMounted) {
          // Try to load from cache first
          const cachedStatus = getAdminStatusFromCache(session.user.id)
          if (cachedStatus !== null) {
            console.log('✅ Loaded admin status from cache immediately')
            setIsAdmin(cachedStatus)
            setAdminChecked(true)
            setCachedUserId(session.user.id)
            setLoading(false)
            setIsInitialized(true)
            clearTimeout(loadingTimeout)
            // Check password change requirement
            checkPasswordChangeRequired()
          } else {
            await checkAdminStatus(session.user)
            setIsInitialized(true)
            // Check password change requirement
            checkPasswordChangeRequired()
          }
        } else if (isMounted) {
          setIsAdmin(false)
          setAdminChecked(true)
          setIsInitialized(true)
        }
        
        if (isMounted) {
          setLoading(false)
          clearTimeout(loadingTimeout)
          isInitialLoad = false
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (isMounted) {
          setSession(null)
          setUser(null)
          setIsAdmin(false)
          setAdminChecked(true)
          setLoading(false)
          setIsInitialized(true)
          clearTimeout(loadingTimeout)
          isInitialLoad = false
        }
      }
    }

    initializeAuth()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email)
      
      // Skip the initial session event if we just loaded it
      if (isInitialLoad && event === 'INITIAL_SESSION') {
        return
      }

      if (!isMounted) return
      
      // If we're signing out, ignore any session restoration attempts
      if (isSigningOutRef.current && event !== 'SIGNED_OUT') {
        console.log('Ignoring auth state change during sign out:', event)
        return
      }
      
      // If we get a SIGNED_OUT event, clear everything
      if (event === 'SIGNED_OUT') {
        console.log('SIGNED_OUT event received, clearing all state')
        setUser(null)
        setSession(null)
        setIsAdmin(false)
        setAdminChecked(true)
        setCachedUserId(null)
        setLoading(false)
        isSigningOutRef.current = false
        return
      }

      const previousUserId = user?.id
      const newUserId = session?.user?.id

      setSession(session)
      setUser(session?.user ?? null)
      
      // Update cross-domain auth cookie on session changes (login, token refresh)
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        setAuthCookie({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at
        })
      }
      
      // Only reset admin check if the user actually changed
      if (previousUserId !== newUserId) {
        console.log('User changed, resetting admin status')
        setAdminChecked(false)
        setCachedUserId(null)
      }
      
      // Set loading to false immediately for SIGNED_IN events to update UI quickly
      if (event === 'SIGNED_IN') {
        setLoading(false)
      }
      
      // Only check admin status if user is logged in
      if (session?.user) {
        // Only force check on SIGNED_IN event or if user changed
        const shouldForceCheck = event === 'SIGNED_IN' || previousUserId !== newUserId
        
        if (shouldForceCheck) {
          console.log('User logged in, checking admin status...')
          // For SIGNED_IN event, check immediately (already checked in signIn, but ensure it's up to date)
          // Reduced delay since we check immediately in signIn function
          if (event === 'SIGNED_IN') {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          const isAdminResult = await checkAdminStatus(session.user, true)
          console.log('Admin check result:', isAdminResult)
        } else {
          // User session refreshed but same user - use cached value
          console.log('Same user session, using cached admin status:', isAdmin)
        }
      } else {
        console.log('No user session, clearing admin status')
        setIsAdmin(false)
        setAdminChecked(true)
        setCachedUserId(null)
        setLoading(false)
      }
      
      // Only set loading to false if we haven't already done it for SIGNED_IN
      if (event !== 'SIGNED_IN') {
        setLoading(false)
      }
    })

    return () => {
      isMounted = false
      clearTimeout(loadingTimeout)
      subscription.unsubscribe()
    }
  }, [isInitialized, cacheLoaded])

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || '',
          display_name: fullName || '', // This shows in Supabase dashboard
        }
      }
    })

    return { error }
  }

  // Helper function to get email from identifier (email or username)
  const getEmailFromIdentifier = async (identifier: string): Promise<string | null> => {
    console.log('🔍 getEmailFromIdentifier called with:', identifier)
    
    // If it's already an email (contains @), return it
    if (identifier.includes('@')) {
      console.log('✅ Identifier is an email, returning directly')
      return identifier
    }
    
    // Otherwise, it's a username - look it up via API route to avoid SSL issues
    console.log('🔎 Looking up username via API route...')
    try {
      const response = await fetch('/api/auth/get-email-from-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: identifier }),
      })

      console.log('📡 API response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ Error looking up username:', errorData.error || 'Username not found', errorData)
        return null
      }

      const data = await response.json()
      console.log('✅ Username lookup successful, email:', data.email ? '***' : 'NOT FOUND')
      return data.email || null
    } catch (error) {
      console.error('❌ Exception looking up username:', error)
      return null
    }
  }

  const signIn = async (identifier: string, password: string) => {
    console.log('🔐 signIn called with identifier:', identifier)
    
    // Get email from identifier (email or username)
    const email = await getEmailFromIdentifier(identifier)
    
    if (!email) {
      console.error('❌ No email found for identifier:', identifier)
      return { 
        error: { 
          message: 'Invalid email or username. Please check your credentials.' 
        } 
      }
    }
    
    console.log('✅ Email resolved, attempting sign in with email:', email ? '***' : 'NOT FOUND')
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      console.error('❌ Sign in error:', error.message, error)
    } else {
      console.log('✅ Sign in successful, user:', data.user?.id)
    }
    
    // If successful, immediately update the user state and check admin status
    if (!error && data.user && data.session) {
      setUser(data.user)
      setSession(data.session)
      setLoading(false)
      // Immediately check admin status after login to ensure UI updates
      await checkAdminStatus(data.user, true)
      
      // Set cross-domain auth cookie for SSO
      setAuthCookie({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      })
    }
    
    return { error }
  }

  const signOut = async () => {
    try {
      // Set flag to prevent auth state listener from restoring session
      isSigningOutRef.current = true
      
      const currentUserId = user?.id
      
      // Clear local state immediately to prevent UI from showing logged in state
      setUser(null)
      setSession(null)
      setIsAdmin(false)
      setAdminChecked(false)
      setCachedUserId(null)
      
      // Clear admin status cache
      if (currentUserId) {
        clearAdminStatusCache(currentUserId)
      } else {
        clearAdminStatusCache() // Clear all if no user ID
      }
      
      // Clear cross-domain auth cookie
      clearAuthCookie()
      
      // Check if there's an active session first
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session) {
        // Clear all sessions (refresh + access) for this user on all devices
        const { error } = await supabase.auth.signOut({ scope: 'global' })
        
        if (error) {
          console.error('Error signing out from Supabase:', error)
        }
      }
      
      // Clear all Supabase storage keys to ensure complete logout
      try {
        // Clear all localStorage items related to Supabase
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            localStorage.removeItem(key)
          }
        })
        
        // Also clear sessionStorage
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase')) {
            sessionStorage.removeItem(key)
          }
        })
      } catch (storageError) {
        console.log('Error clearing storage:', storageError)
      }
      
      console.log('✅ Signed out and cleared all caches and storage')
      
      return { error: null }
    } catch (err) {
      console.error('Error in auth context signOut:', err)
      // Clear local state even on error
      const currentUserId = user?.id
      setUser(null)
      setSession(null)
      setIsAdmin(false)
      setAdminChecked(false)
      setCachedUserId(null)
      
      // Clear cache even on error
      if (currentUserId) {
        clearAdminStatusCache(currentUserId)
      }
      
      return { error: err }
    } finally {
      // Keep the flag set briefly to prevent immediate restoration
      // The redirect will happen before this is reset
    }
  }

  const resetPassword = async (email: string) => {
    // Use the API endpoint which uses /auth/v1/recover
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { error: data.error || new Error('Failed to send password reset email') }
    }

    return { error: null }
  }

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    return { error }
  }

  // Send OTP for password reset
  const sendOTP = async (email: string) => {
    try {
      // Call the API endpoint which uses /auth/v1/recover
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { error: data.error || 'Failed to send verification code', success: false }
      }

      return { error: null, success: true }
    } catch (err) {
      console.error('Exception sending OTP:', err)
      return { error: err, success: false }
    }
  }

  // Verify OTP token
  const verifyOTP = async (email: string, token: string) => {
    try {
      // Verify OTP with Supabase (use 'recovery' type for password reset)
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery'
      })

      if (error) {
        console.error('Error verifying OTP:', error)
        return { error, success: false }
      }

      // If successful, the session is created
      return { error: null, success: true }
    } catch (err) {
      console.error('Exception verifying OTP:', err)
      return { error: err, success: false }
    }
  }

  // Function to refresh admin status (useful when admin status might have changed)
  const refreshAdminStatus = async () => {
    setAdminChecked(false)
    await checkAdminStatus(user, true)
  }

  // Check if password change is required
  const checkPasswordChangeRequired = async () => {
    if (!user || !session) {
      setMustChangePassword(false)
      return
    }

    try {
      const response = await fetch('/api/auth/password-change-required', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setMustChangePassword(data.mustChangePassword || false)
      } else {
        setMustChangePassword(false)
      }
    } catch (error) {
      console.error('Error checking password change requirement:', error)
      setMustChangePassword(false)
    }
  }

  // Admin management functions
  const setUserRole = async (userId: string, role: 'admin' | 'user') => {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { role }
    })
    return { error }
  }

  const getUserRole = async (user: User | null) => {
    if (!user) return null
    
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('user_type')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error fetching user role:', error)
        return 'company' // Default to company if error
      }

      return profile?.user_type || 'company'
    } catch (error) {
      console.error('Error getting user role:', error)
      return 'company' // Default to company if error
    }
  }

  const value = {
    user,
    session,
    loading,
    isAdmin,
    adminChecked,
    userProfile,
    mustChangePassword,
    checkPasswordChangeRequired,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    sendOTP,
    verifyOTP,
    setUserRole,
    getUserRole,
    refreshAdminStatus,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
