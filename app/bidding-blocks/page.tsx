import { redirect } from 'next/navigation'

/** Legacy URL: public map/blocks UI now lives in the bidding portal. */
export default function BiddingBlocksPage() {
  redirect('/bidding-portal/interactive-map')
}
