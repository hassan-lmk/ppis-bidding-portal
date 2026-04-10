'use client'

import Image from 'next/image'
import Link from 'next/link'
import PublicSiteHeader from './components/PublicSiteHeader'
import { Button } from './components/ui/button'
import { useAuth } from './lib/auth'

/** Hero fills viewport; navigation sits inside on a transparent bar */
const HERO_BG = '/images/Gemini_Generated_Image_6bkbzd6bkbzd6bkb.webp'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()

  return (
    <div className="h-dvh max-h-dvh flex flex-col bg-gray-950 overflow-hidden">
      <section className="relative flex flex-1 min-h-0 flex-col overflow-hidden">
        <Image
          src={HERO_BG}
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/45 pointer-events-none" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 via-[30%] to-transparent to-[48%] pointer-events-none"
          aria-hidden
        />

        <PublicSiteHeader variant="heroOverlay" />

        <div className="relative z-10 flex-1 flex w-full min-h-0 overflow-hidden">
          <div className="w-full flex flex-col lg:flex-row lg:items-stretch flex-1 min-h-0 gap-0">
            <div className="px-4 sm:px-6 lg:pl-6 lg:pr-8 xl:pl-8 flex flex-col justify-center shrink-0 py-6 sm:py-8 lg:py-4 lg:w-[min(100%,36rem)] xl:w-[min(100%,42rem)] min-h-0 overflow-y-auto lg:overflow-visible">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-white tracking-tight drop-shadow-sm text-center lg:text-left">
                Pakistan Petroleum Information Services Bidding Portal
              </h1>
              <p className="mt-4 max-w-3xl mx-auto lg:mx-0 text-base sm:text-lg text-white/90 text-center lg:text-left">
                Access bidding documents, submit bids online, and manage your full bidding workflow from one secure
                portal built for Pakistan&apos;s petroleum exploration sector.
              </p>
              {!authLoading && (
                <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center lg:justify-start">
                  {user ? (
                    <Button
                      size="lg"
                      className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg w-full sm:w-auto min-w-[240px]"
                      asChild
                    >
                      <Link href="/bidding-portal">Access Bidding Portal</Link>
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="lg"
                        className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg w-full sm:w-auto min-w-[200px]"
                        asChild
                      >
                        <Link href="/signup">Create bidder account</Link>
                      </Button>
                      <Button
                        size="lg"
                        variant="secondary"
                        className="bg-white/95 text-teal-900 hover:bg-white shadow-lg w-full sm:w-auto min-w-[200px]"
                        asChild
                      >
                        <Link href="/login">Sign in</Link>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="relative flex-1 flex min-h-0 items-end lg:items-stretch justify-end pr-0 mr-0 w-full lg:w-auto shrink lg:grow">
              <div className="relative w-full lg:flex-1 min-h-[180px] sm:min-h-[220px] lg:min-h-0 h-[min(52dvh,calc(100dvh-8rem))] sm:h-[min(60dvh,calc(100dvh-6rem))] lg:h-full max-h-full">
                <Image
                  src="/images/918shots_so.png"
                  alt="PPIS Bidding Portal dashboard preview showing sidebar navigation and interactive map"
                  fill
                  className="object-contain object-right"
                  sizes="(max-width: 1024px) 100vw, 72vw"
                  quality={90}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
