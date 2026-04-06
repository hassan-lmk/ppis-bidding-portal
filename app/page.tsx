'use client'

import Image from 'next/image'
import Link from 'next/link'
import PublicSiteHeader from './components/PublicSiteHeader'
import { Button } from './components/ui/button'

/** Hero fills viewport; navigation sits inside on a transparent bar */
const HERO_BG = '/images/Gemini_Generated_Image_6bkbzd6bkbzd6bkb.webp'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <section className="relative min-h-screen flex flex-col overflow-x-hidden">
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

        <div className="relative z-10 flex-1 flex w-full min-h-0 pb-6 lg:pb-0">
          <div className="w-full flex flex-col lg:flex-row lg:items-stretch flex-1 min-h-[calc(100dvh-3.5rem)]">
            <div className="px-4 sm:px-6 lg:pl-6 lg:pr-8 xl:pl-8 flex flex-col justify-center shrink-0 py-8 md:py-10 lg:py-0 lg:w-[min(100%,28rem)] xl:w-[min(100%,32rem)]">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-white tracking-tight drop-shadow-sm text-center lg:text-left">
                Bidding Portal
              </h1>
              <p className="mt-4 max-w-2xl mx-auto lg:mx-0 text-base sm:text-lg text-white/90 text-center lg:text-left">
                Manage open blocks, documents, and bids in one place — built for Pakistan&apos;s petroleum
                exploration community.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center lg:justify-start">
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
                  <Link href="/login">Login</Link>
                </Button>
              </div>
            </div>

            <div
              className="relative flex-1 flex items-end lg:items-center justify-end min-h-[200px] lg:min-h-0 pr-0 mr-0 w-full lg:w-auto shrink lg:grow"
            >
              <Image
                src="/images/918shots_so.png"
                alt="PPIS Bidding Portal dashboard preview showing sidebar navigation and interactive map"
                width={1920}
                height={1440}
                className="w-auto h-auto max-h-[min(52vh,calc(100dvh-8rem))] sm:max-h-[min(60vh,calc(100dvh-6rem))] lg:max-h-[calc(100dvh-3.5rem)] max-w-none object-contain object-right ml-auto"
                sizes="(max-width: 1024px) 100vw, 65vw"
                quality={90}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
