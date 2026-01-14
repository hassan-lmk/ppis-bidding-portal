import https from 'https'
import { httpsAgent } from './security'

export interface SupabaseRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: any
  headers?: Record<string, string>
}

export async function makeSupabaseRequest(
  tableOrUrl: string,
  options: SupabaseRequestOptions = {}
): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration')
  }

  const { method = 'GET', data, headers = {} } = options
  
  // Build the query URL - check if it's already a full URL or just a table name
  const url = tableOrUrl.startsWith('http') 
    ? new URL(tableOrUrl)
    : new URL(`${supabaseUrl}/rest/v1/${tableOrUrl}`)
  
  // Set default headers
  const defaultHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
    ...headers
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url.toString())
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: defaultHeaders,
      agent: httpsAgent // Use configurable HTTPS agent from security utility
    }
    
    const req = https.request(requestOptions, (res) => {
      let responseData = ''
      
      res.on('data', (chunk) => {
        responseData += chunk
      })
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`))
          return
        }
        
        try {
          const result = responseData ? JSON.parse(responseData) : null
          resolve(result)
        } catch (parseError) {
          reject(parseError)
        }
      })
    })
    
    req.on('error', (error) => {
      reject(error)
    })
    
    if (data && method !== 'GET') {
      req.write(JSON.stringify(data))
    }
    
    req.end()
  })
}

// Helper functions for common operations
export async function selectFromTable(table: string, select = '*', filters: Record<string, any> = {}, orderBy?: string, limit?: number): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration')
  }

  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  url.searchParams.set('select', select)
  
  // Add filters
  Object.entries(filters).forEach(([key, value]) => {
    url.searchParams.set(key, `eq.${value}`)
  })
  
  // Add ordering
  if (orderBy) {
    url.searchParams.set('order', orderBy)
  }

  // Add limit if specified (use Range header for better compatibility)
  const headers: Record<string, string> = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  }

  if (limit !== undefined) {
    // Use Range header to request specific number of rows
    headers['Range'] = `0-${limit - 1}`
  } else {
    // Request a large number of rows if no limit specified (PostgREST default is 1000)
    headers['Range'] = '0-9999'
  }

  // Pass the full URL with filters instead of just the table name
  return makeSupabaseRequest(url.toString(), {
    method: 'GET',
    headers
  })
}

export async function insertIntoTable(table: string, data: any): Promise<any> {
  return makeSupabaseRequest(table, {
    method: 'POST',
    data,
    headers: {
      'Prefer': 'return=representation'
    }
  })
}

export async function updateTable(table: string, data: any, filters: Record<string, any>): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration')
  }

  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  
  // Add filters
  Object.entries(filters).forEach(([key, value]) => {
    url.searchParams.set(key, `eq.${value}`)
  })

  // Pass the full URL with filters instead of just the table name
  return makeSupabaseRequest(url.toString(), {
    method: 'PATCH',
    data,
    headers: {
      'Prefer': 'return=representation'
    }
  })
}

export async function deleteFromTable(table: string, filters: Record<string, any>): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration')
  }

  // Build the query URL with filters
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`)
  
  // Add filters as query parameters
  Object.entries(filters).forEach(([key, value]) => {
    // Remove the "eq." prefix if it's already there
    const cleanValue = value.toString().startsWith('eq.') ? value.toString().substring(3) : value.toString()
    url.searchParams.set(key, `eq.${cleanValue}`)
  })

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url.toString())
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      agent: httpsAgent // Use configurable HTTPS agent from security utility
    }
    
    const req = https.request(requestOptions, (res) => {
      let responseData = ''
      
      res.on('data', (chunk) => {
        responseData += chunk
      })
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`))
          return
        }
        
        try {
          const result = responseData ? JSON.parse(responseData) : null
          resolve(result)
        } catch (parseError) {
          reject(parseError)
        }
      })
    })
    
    req.on('error', (error) => {
      reject(error)
    })
    
    req.end()
  })
}

export async function deleteFromStorage(bucket: string, filePath: string): Promise<any> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase configuration')
  }

  // Build the storage API URL
  const url = new URL(`${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`)

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url.toString())
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      agent: httpsAgent // Use configurable HTTPS agent from security utility
    }
    
    const req = https.request(requestOptions, (res) => {
      let responseData = ''
      
      res.on('data', (chunk) => {
        responseData += chunk
      })
      
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`))
          return
        }
        
        try {
          const result = responseData ? JSON.parse(responseData) : null
          resolve(result)
        } catch (parseError) {
          // For DELETE operations, empty response is often OK
          resolve(null)
        }
      })
    })
    
    req.on('error', (error) => {
      reject(error)
    })
    
    req.end()
  })
}

