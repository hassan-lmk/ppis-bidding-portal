import { supabase } from './supabase'

export type PortalSidebarCounts = {
  openBlocks: number
  purchased: number
  submitted: number
  tickets: number
  payments: number
}

/**
 * Sidebar badge counts only — narrow selects / head counts where possible.
 */
export async function fetchPortalSidebarCounts(userId: string): Promise<PortalSidebarCounts> {
  const [
    { count: openCount },
    { data: purchasedRows },
    { count: submittedCount },
    { count: ticketsCount },
    { count: paymentsCount },
  ] = await Promise.all([
    supabase
      .from('areas')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Open'),
    supabase
      .from('area_downloads')
      .select('area_id')
      .eq('user_id', userId)
      .eq('payment_status', 'completed'),
    supabase
      .from('bid_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['submitted', 'under_review', 'approved']),
    supabase
      .from('support_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'closed'),
    supabase
      .from('bid_applications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('application_fee_status', ['paid', 'verified']),
  ])

  let availableForSubmissionCount = 0
  const purchasedData = purchasedRows || []
  if (purchasedData.length > 0) {
    const purchasedAreaIds = purchasedData.map((d: { area_id: string }) => d.area_id)
    const { data: bidApps } = await supabase
      .from('bid_applications')
      .select('area_id, status')
      .eq('user_id', userId)
      .in('area_id', purchasedAreaIds)

    const areaBidStatusMap: Record<string, string> = {}
    if (bidApps) {
      bidApps.forEach((app: { area_id: string; status: string }) => {
        areaBidStatusMap[app.area_id] = app.status
      })
    }

    availableForSubmissionCount = purchasedAreaIds.filter((areaId: string) => {
      const bidStatus = areaBidStatusMap[areaId]
      return !bidStatus || bidStatus === 'draft'
    }).length
  }

  return {
    openBlocks: openCount || 0,
    purchased: availableForSubmissionCount,
    submitted: submittedCount || 0,
    tickets: ticketsCount || 0,
    payments: paymentsCount || 0,
  }
}
