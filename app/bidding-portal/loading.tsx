import { Loader2 } from 'lucide-react'

export default function BiddingPortalLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-12 h-12 animate-spin text-teal-600" />
    </div>
  )
}
