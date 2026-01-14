// Cache for bidding portal status to prevent duplicate API calls
let statusCache: { enabled: boolean; timestamp: number } | null = null
const CACHE_DURATION = 60000 // 1 minute cache duration

let pendingRequest: Promise<boolean> | null = null

/**
 * Get bidding portal status with caching and request deduplication
 * @returns Promise<boolean> - Whether the bidding portal is enabled
 */
export async function getBiddingPortalStatus(): Promise<boolean> {
  // Check cache first
  if (statusCache && Date.now() - statusCache.timestamp < CACHE_DURATION) {
    return statusCache.enabled
  }

  // If there's already a pending request, return that instead of making a new one
  if (pendingRequest) {
    return pendingRequest
  }

  // Create new request
  pendingRequest = (async () => {
    try {
      const response = await fetch('/api/bidding-portal/status', {
        cache: 'no-store', // Ensure fresh data when cache expires
      })
      
      if (response.ok) {
        const data = await response.json()
        statusCache = { enabled: data.enabled, timestamp: Date.now() }
        pendingRequest = null
        return data.enabled
      }
    } catch (err) {
      console.error('Error checking portal status:', err)
      pendingRequest = null
    }
    
    // Default to enabled if check fails
    pendingRequest = null
    return true
  })()

  return pendingRequest
}

/**
 * Clear the bidding portal status cache
 * Useful when you need to force a refresh
 */
export function clearBiddingPortalStatusCache() {
  statusCache = null
  pendingRequest = null
}
