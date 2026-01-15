import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '../../lib/email'
import { getOnboardingCompletedUserTemplate, getOnboardingCompletedAdminTemplate } from '../../lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, ...emailData } = body

    let template

    if (type === 'onboarding-completed-user') {
      template = getOnboardingCompletedUserTemplate(
        emailData.userName,
        emailData.companyName,
        emailData.address,
        emailData.contactNumber
      )
    } else if (type === 'onboarding-completed-admin') {
      template = getOnboardingCompletedAdminTemplate(
        emailData.userName,
        emailData.userEmail,
        emailData.companyName,
        emailData.address,
        emailData.contactNumber
      )
    } else {
      return NextResponse.json({ error: 'Invalid email type' }, { status: 400 })
    }

    const result = await sendEmail({
      to: emailData.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    })

    if (result.success) {
      return NextResponse.json({ success: true, messageId: result.messageId })
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (error) {
    console.error('Error in send-email API:', error)
    return NextResponse.json({ 
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

