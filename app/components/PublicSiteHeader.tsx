'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '../lib/auth'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

export type PublicSiteHeaderVariant = 'solid' | 'heroOverlay' | 'heroOverlayNeutral'

interface PublicSiteHeaderProps {
  /**
   * `heroOverlay`: transparent bar on hero; teal accents on primary CTA.
   * `heroOverlayNeutral`: same layout as home hero nav, monochrome (no teal) buttons.
   */
  variant?: PublicSiteHeaderVariant
  className?: string
}

export default function PublicSiteHeader({
  variant = 'solid',
  className,
}: PublicSiteHeaderProps) {
  const { user, loading: authLoading } = useAuth()
  const overlay = variant === 'heroOverlay' || variant === 'heroOverlayNeutral'
  const neutral = variant === 'heroOverlayNeutral'

  return (
    <header
      className={cn(
        'relative z-20 w-full shrink-0',
        overlay
          ? 'border-0 bg-transparent shadow-none'
          : 'sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80',
        className,
      )}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src={overlay ? '/images/Logo-white.svg' : '/images/PPIS-logo-bg.png'}
            alt="PPIS"
            width={120}
            height={40}
            className="h-9 w-auto"
            priority
          />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              overlay ? 'text-white/95 hover:text-white hover:bg-white/10' : 'text-teal-800',
              'hidden sm:inline-flex',
            )}
            asChild
          >
            <Link href="/">Home</Link>
          </Button>
          {!authLoading && user && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(overlay ? 'text-white/95 hover:text-white hover:bg-white/10' : 'text-teal-800')}
              asChild
            >
              <Link href="/bidding-portal">My portal</Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={
              overlay
                ? 'border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white'
                : 'border-teal-300 text-teal-800'
            }
            asChild
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            variant={neutral ? 'outline' : 'default'}
            size="sm"
            className={
              overlay && neutral
                ? 'border-white/85 bg-transparent text-white hover:bg-white/10 hover:text-white'
                : overlay
                  ? 'bg-white text-teal-900 hover:bg-white/90 shadow-md'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
            }
            asChild
          >
            <Link href="/signup">Create bidder account</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
