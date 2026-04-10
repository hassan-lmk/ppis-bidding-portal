import type { Metadata } from 'next'
import { Figtree } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './lib/auth'
import { CartProvider } from './lib/cart-context'
import { QueryProvider } from './components/providers/query-provider'

const figtree = Figtree({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-figtree',
  preload: true,
})

export const metadata: Metadata = {
  title: 'PPIS Bidding Portal',
  description: 'Access the PPIS Bidding Portal to view and submit bids for petroleum blocks.',
  icons: {
    icon: [
      {
        rel: 'icon',
        url: '/favicon.ico',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="antialiased">
        <AuthProvider>
          <QueryProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
