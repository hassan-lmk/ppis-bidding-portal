'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { useAuth } from './lib/auth'
import { Button } from './components/ui/button'

const InteractiveMapLanding = dynamic(
  () => import('./components/InteractiveMapPortal'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[70vh] rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      </div>
    ),
  },
)

const SIGNUP_URL = 'https://ppisonline.com/signup'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/images/PPIS-logo-bg.png"
              alt="PPIS"
              width={120}
              height={40}
              className="h-9 w-auto"
              priority
            />
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            {!authLoading && user && (
              <Button variant="ghost" size="sm" className="text-teal-800" asChild>
                <Link href="/bidding-portal">My portal</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" className="border-teal-300 text-teal-800" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" asChild>
              <a href={SIGNUP_URL} target="_blank" rel="noopener noreferrer">
                Create bidder account
              </a>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative w-full min-h-[240px] sm:min-h-[280px] md:min-h-[320px]">
        <Image
          src="/images/Banner-2.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/30" aria-hidden />
        <div className="relative z-10 max-w-7xl mx-auto px-4 lg:px-6 py-14 md:py-20">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight drop-shadow-sm">
            Bidding Portal
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-white/90">
            Explore open petroleum blocks on the map. Download block brochures at no cost, or purchase bidding
            documents to proceed to secure checkout via PayFast.
          </p>
        </div>
      </section>

      <section className="flex-1 max-w-7xl mx-auto px-4 lg:px-6 py-6 lg:py-8 w-full">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 bg-gray-50/80">
            <h2 className="text-sm font-semibold text-gray-800">Interactive map — open bidding blocks</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Click a block to view details, download the brochure, or buy bidding documents.
            </p>
          </div>
          <div className="p-2 sm:p-3">
            <InteractiveMapLanding variant="landing" openBlocksOnly />
          </div>
        </div>
      </section>
    </div>
  )
}
