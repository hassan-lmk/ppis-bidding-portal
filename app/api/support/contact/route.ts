import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '../../../lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body || {}

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
    }

    const to = process.env.SMTP_ADMIN_EMAIL || 'support@ppisonline.com'
    const safeName = String(name).trim()
    const safeEmail = String(email).trim()
    const safeSubject = String(subject).trim()
    const safeMessage = String(message).trim()

    const result = await sendEmail({
      to,
      subject: `Support Request: ${safeSubject}`,
      html: `
        <h2>New Public Support Request</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${safeMessage}</p>
      `,
      text: `New Public Support Request\n\nName: ${safeName}\nEmail: ${safeEmail}\nSubject: ${safeSubject}\n\nMessage:\n${safeMessage}`,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send support request.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in public support contact API:', error)
    return NextResponse.json({ error: 'Failed to send support request.' }, { status: 500 })
  }
}

