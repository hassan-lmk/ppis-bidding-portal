import { supabase } from './supabase'

export interface OpenBlock {
  id: string
  name: string
  code: string
  status: string
  zone_id: string
  zone_name: string
  block_name: string
  block_type: string
  price: number
  bid_submission_deadline: string | null
  pdf_url: string[] | null
  brochure_url: string | null
  isPurchased: boolean
}

export interface PurchasedArea {
  id: string
  area_id: string
  area_name: string
  brochure_url?: string | null
  area_code: string
  zone_name: string
  block_name: string
  block_type: string
  downloaded_at: string | null
  pdf_url: string[] | null
  bid_submission_deadline: string | null
  work_program_opens_at: string | null
  bid_application?: {
    id: string
    status: string
    submitted_at: string | null
    primary_applicant_name: string
    submission_type: string
    work_units: number | null
    work_units_status: string | null
    work_units_submitted_at: string | null
  } | null
}

export interface SubmittedApplication {
  id: string
  area_id: string
  area_name: string
  area_code: string
  primary_applicant_name: string
  submission_type: string
  status: string
  submitted_at: string
  work_units: number | null
  work_units_status: string | null
}

export interface Ticket {
  id: string
  ticket_number: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  created_at: string
  updated_at: string
}

export interface BiddingDocumentPayment {
  id: string
  order_id: string
  basket_id: string
  area_name: string
  area_code: string
  amount: number
  currency: string
  status: string
  transaction_id: string | null
  payment_method: string
  created_at: string
  paid_at: string | null
}

export interface ApplicationFeePayment {
  id: string
  bid_application_id: string
  area_name: string
  area_code: string
  amount: number
  currency: string
  status: string
  payment_method: string | null
  transaction_id: string | null
  bank_name: string | null
  challan_number: string | null
  challan_date: string | null
  created_at: string
  paid_at: string | null
  payment_raw_payload?: unknown
}

export interface PortalProfileData {
  company_name: string | null
  address: string | null
  poc_contact_number: string | null
}

export async function fetchBidSubmissionClosingDate(accessToken: string): Promise<Date | null> {
  const response = await fetch('/api/bidding-portal/closing-date', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  if (!data.bid_submission_closing_date) return null
  return new Date(data.bid_submission_closing_date)
}

export async function fetchOpenedBiddingBlocks(userId: string): Promise<OpenBlock[]> {
  const { data: areasData } = await supabase
    .from('areas')
    .select(`
      id, name, code, status, price, bid_submission_deadline, pdf_url, brochure_url, zone_id,
      zones!inner(
        name,
        blocks!inner(name, type)
      )
    `)
    .eq('status', 'Open')
    .order('name')

  const { data: purchasedData } = await supabase
    .from('area_downloads')
    .select('area_id')
    .eq('user_id', userId)
    .eq('payment_status', 'completed')

  const purchasedAreaIds = (purchasedData || []).map((d: { area_id: string }) => d.area_id)

  return (areasData || []).map((area: any) => ({
    id: area.id,
    name: area.name,
    code: area.code,
    status: area.status,
    zone_id: area.zone_id,
    zone_name: area.zones.name,
    block_name: area.zones.blocks.name,
    block_type: area.zones.blocks.type,
    price: area.price || 0,
    bid_submission_deadline: area.bid_submission_deadline,
    pdf_url: Array.isArray(area.pdf_url) ? area.pdf_url : area.pdf_url ? [area.pdf_url] : null,
    brochure_url: area.brochure_url,
    isPurchased: purchasedAreaIds.includes(area.id),
  }))
}

export type PurchasedDocumentsTabResult = {
  purchasedAreas: PurchasedArea[]
  closingDate: Date | null
}

export async function fetchPurchasedDocumentsTab(
  userId: string,
  getAccessToken: () => Promise<string>
): Promise<PurchasedDocumentsTabResult> {
  const closingPromise = getAccessToken()
    .then((t) => fetchBidSubmissionClosingDate(t))
    .catch(() => null)

  const { data: purchasedData } = await supabase
    .from('area_downloads')
    .select(`
      id,
      area_id,
      downloaded_at,
      payment_status,
      areas!inner(
        id, name, code, pdf_url, brochure_url, status, bid_submission_deadline, work_program_opens_at,
        zones!inner(
          name,
          blocks!inner(name, type)
        )
      )
    `)
    .eq('user_id', userId)
    .eq('payment_status', 'completed')

  const purchasedAreaIds = (purchasedData || []).map((d: any) => d.area_id)

  const bidAppsMap = new Map<string, any>()
  if (purchasedAreaIds.length > 0) {
    const { data: bidApps } = await supabase
      .from('bid_applications')
      .select('*')
      .eq('user_id', userId)
      .in('area_id', purchasedAreaIds)

    if (bidApps) {
      bidApps.forEach((app: any) => {
        bidAppsMap.set(app.area_id, app)
      })
    }
  }

  const purchasedAreas: PurchasedArea[] = (purchasedData || []).map((download: any) => {
    const bidApp = bidAppsMap.get(download.area_id)
    return {
      id: download.id,
      area_id: download.area_id,
      area_name: download.areas.name,
      area_code: download.areas.code,
      zone_name: download.areas.zones.name,
      block_name: download.areas.zones.blocks.name,
      block_type: download.areas.zones.blocks.type,
      downloaded_at: download.downloaded_at,
      pdf_url: Array.isArray(download.areas.pdf_url)
        ? download.areas.pdf_url
        : download.areas.pdf_url
          ? [download.areas.pdf_url]
          : null,
      brochure_url: download.areas.brochure_url,
      bid_submission_deadline: download.areas.bid_submission_deadline,
      work_program_opens_at: download.areas.work_program_opens_at,
      bid_application: bidApp
        ? {
            id: bidApp.id,
            status: bidApp.status,
            submitted_at: bidApp.submitted_at,
            primary_applicant_name: bidApp.primary_applicant_name,
            submission_type: bidApp.submission_type,
            work_units: bidApp.work_units,
            work_units_status: bidApp.work_units_status,
            work_units_submitted_at: bidApp.work_units_submitted_at,
          }
        : null,
    }
  })

  const closingDate = await closingPromise
  return { purchasedAreas, closingDate }
}

/** Submitted bids for the user — no dependency on purchased-documents tab data. */
export async function fetchSubmittedApplications(userId: string): Promise<SubmittedApplication[]> {
  const { data: bidApps } = await supabase
    .from('bid_applications')
    .select(`
      id,
      area_id,
      status,
      submitted_at,
      primary_applicant_name,
      submission_type,
      work_units,
      work_units_status,
      areas!inner(
        name,
        code
      )
    `)
    .eq('user_id', userId)
    .in('status', ['submitted', 'under_review', 'approved'])

  return (bidApps || []).map((app: any) => ({
    id: app.id,
    area_id: app.area_id,
    area_name: app.areas?.name || 'Unknown',
    area_code: app.areas?.code || '',
    primary_applicant_name: app.primary_applicant_name,
    submission_type: app.submission_type,
    status: app.status,
    submitted_at: app.submitted_at!,
    work_units: app.work_units,
    work_units_status: app.work_units_status,
  }))
}

export async function fetchSupportTickets(getAccessToken: () => Promise<string>): Promise<Ticket[]> {
  const token = await getAccessToken()
  const ticketsRes = await fetch('/api/tickets', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (ticketsRes.status === 401) {
    throw new Error('Unauthorized')
  }
  if (!ticketsRes.ok) {
    throw new Error('Failed to load tickets')
  }
  return ticketsRes.json()
}

export type PaymentsTabResult = {
  biddingDocPayments: BiddingDocumentPayment[]
  applicationFeePayments: ApplicationFeePayment[]
}

export async function fetchPaymentsTab(userId: string): Promise<PaymentsTabResult> {
  const { data: downloadsData } = await supabase
    .from('area_downloads')
    .select(`
      id,
      order_id,
      area_id,
      payment_status,
      created_at,
      orders!inner(
        id,
        basket_id,
        status,
        total_amount,
        txnid,
        created_at,
        updated_at
      ),
      areas!inner(
        name,
        code
      )
    `)
    .eq('user_id', userId)
    .eq('payment_status', 'completed')
    .eq('orders.status', 'paid')
    .order('created_at', { ascending: false })

  const orderMap = new Map<string, BiddingDocumentPayment>()
  ;(downloadsData || []).forEach((download: any) => {
    if (!download.order_id || !download.orders) return
    const orderId = download.order_id
    if (!orderMap.has(orderId)) {
      orderMap.set(orderId, {
        id: download.orders.id,
        order_id: download.orders.id,
        basket_id: download.orders.basket_id,
        area_name: download.areas?.name || 'Unknown',
        area_code: download.areas?.code || '',
        amount: Number(download.orders.total_amount) || 0,
        currency: 'USD',
        status: download.orders.status,
        transaction_id: download.orders.txnid,
        payment_method: 'payfast',
        created_at: download.orders.created_at,
        paid_at: download.orders.updated_at,
      })
    }
  })

  const { data: bidAppsWithPayments } = await supabase
    .from('bid_applications')
    .select(`
      id,
      application_fee_amount,
      application_fee_status,
      payment_method,
      payment_transaction_id,
      bank_name,
      challan_number,
      challan_date,
      payment_paid_at,
      payment_raw_payload,
      created_at,
      areas!inner(
        name,
        code
      )
    `)
    .eq('user_id', userId)
    .in('application_fee_status', ['paid', 'verified'])
    .order('created_at', { ascending: false })

  const applicationFeePayments: ApplicationFeePayment[] = (bidAppsWithPayments || []).map((app: any) => ({
    id: app.id,
    bid_application_id: app.id,
    area_name: app.areas?.name || 'Unknown',
    area_code: app.areas?.code || '',
    amount: Number(app.application_fee_amount) || 100000,
    currency: 'PKR',
    status: app.application_fee_status,
    payment_method: app.payment_method,
    transaction_id: app.payment_transaction_id,
    bank_name: app.bank_name,
    challan_number: app.challan_number,
    challan_date: app.challan_date,
    created_at: app.created_at,
    paid_at: app.payment_paid_at,
    payment_raw_payload: app.payment_raw_payload,
  }))

  return {
    biddingDocPayments: Array.from(orderMap.values()),
    applicationFeePayments,
  }
}

export async function fetchPortalProfile(userId: string): Promise<PortalProfileData | null> {
  let { data } = await supabase
    .from('user_profiles')
    .select('company_name, address, poc_contact_number')
    .eq('id', userId)
    .maybeSingle()

  if (!data) {
    const alt = await supabase
      .from('user_profiles')
      .select('company_name, address, poc_contact_number')
      .eq('user_id', userId)
      .maybeSingle()
    data = alt.data
  }

  return (data as PortalProfileData) || null
}
