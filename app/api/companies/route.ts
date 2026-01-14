import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '../_supabaseAdmin'

// GET /api/companies - Get all active companies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('include_inactive') === 'true'
    const search = searchParams.get('search') // Optional search parameter

    let query = supabaseAdmin
      .from('companies')
      .select('id, company_name, is_active')
      .order('company_name', { ascending: true })

    // Filter by active status if not including inactive
    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    // Add search filter if provided
    if (search) {
      query = query.ilike('company_name', `%${search}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching companies:', error)
      return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 })
    }

    // Return just the company names for backward compatibility
    const companyNames = (data || []).map((company: any) => company.company_name)

    return NextResponse.json(companyNames)
  } catch (error) {
    console.error('Error in GET /api/companies:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


