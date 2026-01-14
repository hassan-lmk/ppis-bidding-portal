'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '../../../lib/auth'
import { supabase } from '../../../lib/supabase'
import BiddingPortalLayout from '../../../components/BiddingPortalLayout'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Textarea } from '../../../components/ui/textarea'
import { 
  Loader2, Send, X, MessageSquare, User, Shield, Clock, AlertCircle, CheckCircle
} from 'lucide-react'

interface Message {
  id: string
  message: string
  is_admin_reply: boolean
  created_at: string
  is_read: boolean
}

interface Ticket {
  id: string
  ticket_number: number
  subject: string
  description: string
  category: string
  priority: string
  status: string
  created_at: string
  updated_at: string
  messages: Message[]
}

export default function TicketDetailPage() {
  const params = useParams()
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { user, loading: authLoading, session } = useAuth()
  const router = useRouter()

  // Helper function to get auth token
  async function getAuthToken() {
    if (session?.access_token) {
      return session.access_token
    }
    const { data: { session: newSession } } = await supabase.auth.getSession()
    if (!newSession?.access_token) {
      throw new Error('Session expired. Please sign in again.')
    }
    return newSession.access_token
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/bidding-portal')
      return
    }

    if (user && ticketId) {
      fetchTicket()
    }
  }, [user, authLoading, ticketId, router])

  useEffect(() => {
    scrollToBottom()
  }, [ticket?.messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchTicket = async () => {
    try {
      setLoading(true)
      const token = await getAuthToken()

      const response = await fetch(`/api/tickets/${ticketId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Ticket not found')
      }

      const data = await response.json()
      setTicket(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return

    try {
      setSending(true)
      const token = await getAuthToken()

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: newMessage })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error)
      }

      setNewMessage('')
      await fetchTicket()
    } catch (err: any) {
      alert(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const closeTicket = async () => {
    if (!confirm('Are you sure you want to close this ticket?')) return

    try {
      setClosing(true)
      const token = await getAuthToken()

      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'closed' })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error)
      }

      await fetchTicket()
    } catch (err: any) {
      alert(err.message || 'Failed to close ticket')
    } finally {
      setClosing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-blue-50 text-blue-700',
      in_progress: 'bg-amber-50 text-amber-700',
      awaiting_reply: 'bg-purple-50 text-purple-700',
      resolved: 'bg-emerald-50 text-emerald-700',
      closed: 'bg-gray-100 text-gray-700'
    }
    return <Badge className={styles[status] || 'bg-gray-100'}>{status.replace('_', ' ')}</Badge>
  }

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700',
      medium: 'bg-blue-50 text-blue-700',
      high: 'bg-orange-50 text-orange-700',
      urgent: 'bg-red-50 text-red-700'
    }
    return <Badge className={styles[priority] || 'bg-gray-100'}>{priority}</Badge>
  }

  if (loading) {
    return (
      <BiddingPortalLayout 
        activeTab="support" 
        title="Loading..."
        showBackButton
        backHref="/bidding-portal?tab=support"
        backLabel="Back to Tickets"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
        </div>
      </BiddingPortalLayout>
    )
  }

  if (error || !ticket) {
    return (
      <BiddingPortalLayout 
        activeTab="support" 
        title="Error"
        showBackButton
        backHref="/bidding-portal?tab=support"
        backLabel="Back to Tickets"
      >
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ticket Not Found</h3>
            <p className="text-gray-500 mb-6">{error}</p>
            <Button onClick={() => router.push('/bidding-portal?tab=support')}>
              Back to Tickets
            </Button>
          </CardContent>
        </Card>
      </BiddingPortalLayout>
    )
  }

  const isClosed = ticket.status === 'closed'

  return (
    <BiddingPortalLayout 
      activeTab="support" 
      title={`Ticket #${ticket.ticket_number}`}
      subtitle={ticket.subject}
      showBackButton
      backHref="/bidding-portal?tab=support"
      backLabel="Back to Tickets"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Ticket Info */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{ticket.subject}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(ticket.status)}
                  {getPriorityBadge(ticket.priority)}
                  <Badge variant="outline" className="capitalize">{ticket.category}</Badge>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  Created: {formatDate(ticket.created_at)}
                </p>
                <p className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  Updated: {formatDate(ticket.updated_at)}
                </p>
              </div>
            </div>
            
            {!isClosed && (
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={closeTicket}
                  disabled={closing}
                  className="text-gray-600"
                >
                  {closing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  Close Ticket
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="w-5 h-5 text-teal-600" />
              <span>Conversation</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4 p-2">
              {ticket.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.is_admin_reply ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[80%] ${msg.is_admin_reply ? 'order-2' : 'order-1'}`}>
                    <div className={`
                      rounded-2xl px-4 py-3
                      ${msg.is_admin_reply 
                        ? 'bg-gray-100 text-gray-900 rounded-tl-none' 
                        : 'bg-teal-600 text-white rounded-tr-none'
                      }
                    `}>
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    </div>
                    <div className={`flex items-center mt-1 space-x-2 text-xs text-gray-500 ${
                      msg.is_admin_reply ? '' : 'justify-end'
                    }`}>
                      {msg.is_admin_reply ? (
                        <Shield className="w-3 h-3" />
                      ) : (
                        <User className="w-3 h-3" />
                      )}
                      <span>{msg.is_admin_reply ? 'Support' : 'You'}</span>
                      <span>•</span>
                      <span>{formatDate(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Form */}
            {!isClosed ? (
              <div className="border-t pt-4">
                <div className="flex space-x-3">
                  <Textarea
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={3}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="bg-teal-600 hover:bg-teal-700 self-end"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            ) : (
              <div className="border-t pt-4">
                <div className="flex items-center justify-center space-x-2 text-gray-500 py-4">
                  <CheckCircle className="w-5 h-5" />
                  <span>This ticket has been closed</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BiddingPortalLayout>
  )
}
