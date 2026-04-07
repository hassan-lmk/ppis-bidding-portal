'use client'

import { FormEvent, useState } from 'react'
import Image from 'next/image'
import PublicSiteHeader from '../components/PublicSiteHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'

export default function SupportPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus(null)
    setSubmitting(true)

    try {
      const resp = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })

      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        throw new Error(data?.error || 'Unable to submit support request.')
      }

      setStatus({ type: 'ok', text: 'Support request submitted successfully.' })
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    } catch (err: any) {
      setStatus({ type: 'error', text: err?.message || 'Unable to submit support request.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <section className="relative w-full min-h-[240px] sm:min-h-[280px] md:min-h-[320px] flex flex-col">
        <Image
          src="/images/Banner-2.png"
          alt=""
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/30" aria-hidden />
        <PublicSiteHeader variant="heroOverlayNeutral" />
        <div className="relative z-10 flex-1 max-w-7xl mx-auto px-4 lg:px-6 w-full py-10 md:py-14 lg:py-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight drop-shadow-sm">
            Support
          </h1>
          <p className="mt-3 max-w-2xl text-base sm:text-lg text-white/90">
            Need help with registration, documents, payments, or bid submission? Send us your query and our team will
            get back to you.
          </p>
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-4 py-8 w-full">
        <Card>
          <CardHeader>
            <CardTitle>Support</CardTitle>
            <CardDescription>
              Need help? Send us your question and our support team will get back to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                required
              />
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                required
              />
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue"
                rows={6}
                required
              />
              {status && (
                <p className={status.type === 'ok' ? 'text-emerald-700 text-sm' : 'text-red-700 text-sm'}>
                  {status.text}
                </p>
              )}
              <Button
                type="submit"
                disabled={submitting}
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                {submitting ? 'Submitting...' : 'Submit Support Request'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

