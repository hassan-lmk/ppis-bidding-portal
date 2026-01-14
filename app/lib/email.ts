import nodemailer from 'nodemailer'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

// Reusable email UI utilities (standard header/footer)
const getSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || ''
const getLogoUrl = () => `https://ppisapi.lmkr.com//storage/v1/object/public/misc/1761727372507_Logo-white.svg`

const getStandardEmailHeader = (title: string) => {
  const logoUrl = getLogoUrl()
  return `
    <!-- Standard Header -->
    <tr>
      <td style="background: #0d9488; padding: 24px 30px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: middle;">
              <img src="${logoUrl}" alt="PPIS" height="36" style="display: block; max-width: 200px; height: 36px;" />
            </td>
            <td style="text-align: right; color: #ffffff; font-size: 22px; font-weight: 700;">
              ${title}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `
}

const getStandardEmailFooter = () => {
  return `
    <!-- Standard Footer -->
    <tr>
      <td style="background-color: #2d2d2d; padding: 24px 30px; text-align: center; border-top: 1px solid #1a1a1a;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #ffffff;">
          This is an automated email. Please do not reply.
        </p>
        <p style="margin: 0; font-size: 12px; color: #ffffff;">
          For help, contact <a href="mailto:support@ppisonline.com" style="color: #ffffff; text-decoration: underline;">support@ppisonline.com</a>
        </p>
      </td>
    </tr>
  `
}

const STANDARD_TEXT_FOOTER = `\n---\nThis is an automated email. Please do not reply.\nFor help, contact: support@ppisonline.com`

// Create reusable transporter
const createTransporter = () => {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = process.env.SMTP_PORT
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpSenderName = process.env.SMTP_SENDER_NAME || 'PPIS Team'
  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser

  console.log('=== SMTP CONFIGURATION DEBUG ===')
  console.log('SMTP_HOST:', smtpHost ? 'SET' : 'NOT SET')
  console.log('SMTP_PORT:', smtpPort ? 'SET' : 'NOT SET')
  console.log('SMTP_USER:', smtpUser ? 'SET' : 'NOT SET (no auth)')
  console.log('SMTP_PASS:', smtpPass ? 'SET' : 'NOT SET (no auth)')
  console.log('SMTP_FROM_EMAIL:', smtpFromEmail ? 'SET' : 'NOT SET')
  console.log('SMTP_SENDER_NAME:', smtpSenderName)
  console.log('SMTP_AUTH_REQUIRED:', !!(smtpUser && smtpPass))

  // Only require host and port
  if (!smtpHost || !smtpPort) {
    const missing = []
    if (!smtpHost) missing.push('SMTP_HOST')
    if (!smtpPort) missing.push('SMTP_PORT')
    
    throw new Error(`SMTP configuration is missing. Missing variables: ${missing.join(', ')}`)
  }

  // Build config - auth is optional
  const config: any = {
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
  }

  // Only add auth if both user and pass are provided
  if (smtpUser && smtpPass) {
    config.auth = {
      user: smtpUser,
      pass: smtpPass,
    }
  }

  // For port 25, typically requireStartTLS
  if (parseInt(smtpPort) === 25) {
    config.requireTLS = false
    config.ignoreTLS = true
  }

  console.log('SMTP Config:', {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth ? 'ENABLED' : 'DISABLED',
    user: config.auth?.user || 'N/A',
    from: `${smtpSenderName} <${smtpFromEmail}>`
  })

  return nodemailer.createTransport(config)
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  try {
    const transporter = createTransporter()
    const smtpSenderName = process.env.SMTP_SENDER_NAME || 'PPIS ONLINE'
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@ppisonline.com'

    const info = await transporter.sendMail({
      from: `${smtpSenderName} <${smtpFromEmail}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    })

    console.log('Email sent successfully:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, error }
  }
}

// Template for approval email
export function getApprovalEmailTemplate(userName: string, companyName?: string, wasRejected: boolean = false, userType?: string | null) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const isBidder = userType === 'bidder'
  const isCompany = userType === 'company'
  
  // Get features list based on user type
  const getFeaturesList = () => {
    if (isBidder) {
      return `
                <li>Bidding Blocks Access</li>
                <li>Document Downloads</li>
                <li>Bidding Information and Data</li>
              `
    } else if (isCompany) {
      return `
                <li>Upstream Maps and Data</li>
                <li>Upstream Activities</li>
                <li>Bidding Blocks</li>
                <li>Data Review Tools</li>
                <li>Document Archive</li>
                <li>Publications and Sector News</li>
              `
    } else {
      // Default/Admin
      return `
                <li>Upstream Maps and Data</li>
                <li>Upstream Activities</li>
                <li>Data Review Tools</li>
                <li>Document Archive</li>
                <li>Publications and Sector News</li>
              `
    }
  }

  const getAccountTypeDescription = () => {
    if (isBidder) {
      return 'As a Bidder account, you have access to bidding blocks and related documents.'
    } else if (isCompany) {
      return 'As a PPIS Subscriber (Company account), you have full access to all upstream activities, maps, and bidding blocks.'
    }
    return ''
  }
  
  return {
    subject: wasRejected ? 'Your PPIS Account Has Been Re-Approved!' : 'Your PPIS Account Has Been Approved!',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Approved</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Account Approved!')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear ${userName},
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                ${wasRejected ? 
                  `Great news! After further review, your account${companyName ? ` for <strong>${companyName}</strong>` : ''} has been re-approved by our admin team.` :
                  `Great news! Your account${companyName ? ` for <strong>${companyName}</strong>` : ''} has been approved by our admin team.`
                }
              </p>
              
              ${getAccountTypeDescription() ? `
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                ${getAccountTypeDescription()}
              </p>
              ` : ''}
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                You now have access to the following PPIS portal features:
              </p>
              
              <ul style="margin: 0 0 30px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #333333;">
                ${getFeaturesList()}
              </ul>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${siteUrl}/login" style="display: inline-block; padding: 15px 40px; background-color: #2CBCA6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Login to Your Account
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.6; color: #333333;">
                If you have any questions or need assistance, please don't hesitate to contact our support team.
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>The PPIS Team</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Dear ${userName},

${wasRejected ? 
  `Great news! After further review, your account${companyName ? ` for ${companyName}` : ''} has been re-approved by our admin team.` :
  `Great news! Your account${companyName ? ` for ${companyName}` : ''} has been approved by our admin team.`
}

${getAccountTypeDescription() ? `${getAccountTypeDescription()}\n\n` : ''}
You now have access to the following PPIS portal features:
${isBidder ? `- Bidding Blocks Access
- Document Downloads
- Bidding Information and Data` : isCompany ? `- Upstream Maps and Data
- Upstream Activities
- Bidding Blocks
- Data Review Tools
- Document Archive
- Publications and Sector News` : `- Upstream Maps and Data
- Upstream Activities
- Data Review Tools
- Document Archive
- Publications and Sector News`}



If you have any questions or need assistance, please don't hesitate to contact our support team.

Best regards,
The PPIS Team

${STANDARD_TEXT_FOOTER}
    `
  }
}

// Template for rejection email
export function getRejectionEmailTemplate(userName: string, rejectionReason: string, companyName?: string, userType?: string | null) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const contactEmail = process.env.SMTP_ADMIN_EMAIL || 'support@ppis.com'
  const isBidder = userType === 'bidder'
  const isCompany = userType === 'company'
  
  const getAccountTypeContext = () => {
    if (isBidder) {
      return 'As a Bidder account applicant,'
    } else if (isCompany) {
      return 'As a PPIS Subscriber (Company account) applicant,'
    }
    return ''
  }
  
  return {
    subject: 'PPIS Account Application - Update Required',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Application Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Account Application Update')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear ${userName},
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Thank you for your interest in the PPIS portal${companyName ? ` on behalf of <strong>${companyName}</strong>` : ''}.
              </p>
              
              ${getAccountTypeContext() ? `
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                ${getAccountTypeContext()} we appreciate your application.
              </p>
              ` : ''}
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                After reviewing your application, we are unable to approve your account at this time for the following reason:
              </p>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px 20px; margin: 0 0 30px;">
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #856404;">
                  <strong>Reason:</strong> ${rejectionReason}
                </p>
              </div>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                If you believe this decision was made in error or if you would like to provide additional information, please contact our support team at:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="mailto:${contactEmail}" style="display: inline-block; padding: 15px 40px; background-color: #118182; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Contact Support
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>The PPIS Team</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Dear ${userName},

Thank you for your interest in the PPIS portal${companyName ? ` on behalf of ${companyName}` : ''}.

After reviewing your application, we are unable to approve your account at this time for the following reason:

Reason: ${rejectionReason}

If you believe this decision was made in error or if you would like to provide additional information, please contact our support team at: ${contactEmail}

Best regards,
The PPIS Team

${STANDARD_TEXT_FOOTER}
    `
  }
}

export function getUnapproveEmailTemplate(userName: string, companyName: string) {
  const subject = 'Account Access Update - PPIS Portal'
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Access Update</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Account Access Update')}
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">Dear ${userName || 'Valued User'},</p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">We are writing to inform you that your account access has been temporarily suspended pending further review.</p>
              <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px; font-size: 16px; color: #92400e;">Important Notice:</h3>
                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #92400e;">Your account status has been changed from "Approved" to "Pending Approval". This means you will not be able to access restricted content until your account is reviewed and approved again.</p>
              </div>
              <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.6; color: #333333;">This action may have been taken for various reasons including:</p>
              <ul style="margin: 0 0 20px; padding-left: 20px; font-size: 16px; line-height: 1.8; color: #333333;">
                <li>Account security review</li>
                <li>Compliance verification</li>
                <li>Administrative review</li>
              </ul>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">If you believe this action was taken in error, or if you have any questions about this change, please contact our support team immediately.</p>
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">We apologize for any inconvenience this may cause and appreciate your understanding.</p>
              <p style="margin: 20px 0 0; font-size: 16px; line-height: 1.6; color: #333333;">Best regards,<br>PPIS Team</p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
  
  const text = `
Account Access Update - PPIS Portal

Dear ${userName || 'Valued User'},

We are writing to inform you that your account access has been temporarily suspended pending further review.

Important Notice:
Your account status has been changed from "Approved" to "Pending Approval". This means you will not be able to access restricted content until your account is reviewed and approved again.

This action may have been taken for various reasons including:
- Account security review
- Compliance verification
- Administrative review

If you believe this action was taken in error, or if you have any questions about this change, please contact our support team immediately.

We apologize for any inconvenience this may cause and appreciate your understanding.

Best regards,
PPIS Team

${STANDARD_TEXT_FOOTER}
  `
  
  return { subject, html, text }
}

// Template for user - onboarding completed (waiting for admin approval)
export function getOnboardingCompletedUserTemplate(userName: string, companyName: string, address: string, contactNumber: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ppis.com'
  
  return {
    subject: 'Profile Submitted - Awaiting Admin Approval',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profile Submitted</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Profile Submitted Successfully')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear ${userName},
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Thank you for completing your profile! We have received your company information and it is now awaiting admin approval.
              </p>
              
              <div style="background-color: #e6f7f5; border-left: 4px solid #2CBCA6; padding: 15px 20px; margin: 0 0 30px;">
                <p style="margin: 0 0 10px; font-size: 15px; line-height: 1.6; color: #333333;">
                  <strong>Your Submitted Information:</strong>
                </p>
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Company:</strong> ${companyName}
                </p>
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Address:</strong> ${address}
                </p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Contact:</strong> ${contactNumber}
                </p>
              </div>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Our admin team will review your profile and notify you once your account has been approved. This typically takes 1-2 business days.
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                In the meantime, you can check your approval status at:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${siteUrl}/pending-approval" style="display: inline-block; padding: 15px 40px; background-color: #2CBCA6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Check Approval Status
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.6; color: #333333;">
                If you have any questions, please contact our support team.
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>The PPIS Team</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Profile Submitted Successfully

Dear ${userName},

Thank you for completing your profile! We have received your company information and it is now awaiting admin approval.

Your Submitted Information:
- Company: ${companyName}
- Address: ${address}
- Contact: ${contactNumber}

Our admin team will review your profile and notify you once your account has been approved. This typically takes 1-2 business days.

Check your approval status: ${siteUrl}/pending-approval

If you have any questions, please contact our support team.

Best regards,
The PPIS Team

${STANDARD_TEXT_FOOTER}
    `
  }
}

// Template for admin - new company needs approval
export function getOnboardingCompletedAdminTemplate(userName: string, userEmail: string, companyName: string, address: string, contactNumber: string) {
  const adminDashboardUrl = process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/admin/users` : 'https://ppis.com/admin/users'
  
  return {
    subject: 'New Company Profile Pending Approval',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Profile Pending Approval</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('New Profile Pending Approval')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Hello Admin,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                A new company has completed their onboarding and is waiting for your approval.
              </p>
              
              <div style="background-color: #fff7ed; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 0 0 30px;">
                <p style="margin: 0 0 15px; font-size: 15px; font-weight: 600; color: #333333;">
                  Company Details:
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #333333;">
                  <strong>Contact Name:</strong> ${userName}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #333333;">
                  <strong>Email:</strong> ${userEmail}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #333333;">
                  <strong>Company Name:</strong> ${companyName}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6; color: #333333;">
                  <strong>Address:</strong> ${address}
                </p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #333333;">
                  <strong>Contact Number:</strong> ${contactNumber}
                </p>
              </div>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Please review the profile and approve or reject it from the admin dashboard.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${adminDashboardUrl}" style="display: inline-block; padding: 15px 40px; background-color: #f59e0b; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Review & Approve Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>PPIS System</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
New Profile Pending Approval

Hello Admin,

A new company has completed their onboarding and is waiting for your approval.

Company Details:
- Contact Name: ${userName}
- Email: ${userEmail}
- Company Name: ${companyName}
- Address: ${address}
- Contact Number: ${contactNumber}

Please review the profile and approve or reject it from the admin dashboard.

Review & Approve Now: ${adminDashboardUrl}

Best regards,
PPIS System

${STANDARD_TEXT_FOOTER}
    `
  }
}

// Templates for account type change request (bidder -> subscriber)
export function getAccountChangeRequestTemplate(
  userEmail: string,
  fromType: string,
  toType: string,
  isAdminNotification: boolean
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''
  const title = 'Account Change Request Received'
  const targetLabel = `${fromType || 'unknown'} → ${toType || 'unknown'}`

  const adminIntro = `
    A user has requested an account type change.
  `
  const userIntro = `
    We’ve received your request to change your account type.
  `

  const body = isAdminNotification ? adminIntro : userIntro

  const ctaHref = isAdminNotification
    ? (siteUrl ? `${siteUrl}/admin/users` : '#')
    : (siteUrl || '#')

  const ctaLabel = isAdminNotification ? 'Review in Admin' : 'Go to Dashboard'

  return {
    subject: 'Account Change Request Received',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background-color:#f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f4f4f4;">
    <tr><td style="padding:40px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        ${getStandardEmailHeader(title)}
        <tr>
          <td style="padding:32px 28px;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#333333;">${body}</p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333333;">
              <strong>User:</strong> ${userEmail}
            </p>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333333;">
              <strong>Requested change:</strong> ${targetLabel}
            </p>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#555555;">
              We will review this request and update the account type accordingly.
            </p>
            ${ctaHref ? `
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="text-align:center;padding:16px 0;">
                  <a href="${ctaHref}" style="display:inline-block;padding:12px 28px;background-color:#2CBCA6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
            </table>` : ''}
          </td>
        </tr>
        ${getStandardEmailFooter()}
      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
    text: `
Account Change Request Received
User: ${userEmail}
Requested change: ${targetLabel}
We will review this request and update the account type accordingly.
${ctaHref ? `\nReview: ${ctaHref}` : ''}
${STANDARD_TEXT_FOOTER}
    `
  }
}

// Template for successful document purchase
export function getPurchaseConfirmationEmailTemplate(
  userName: string,
  orderId: string,
  transactionId: string,
  totalAmount: number,
  currency: string,
  purchasedItems: Array<{
    areaName: string
    areaCode: string
    blockName?: string
    zoneName?: string
    quantity: number
    unitPrice: number
  }>
) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ppisonline.com'
  
  // Always use USD for email display (we always charge in USD)
  const displayCurrency = 'USD'
  
  // Format currency amount
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: displayCurrency
  }).format(totalAmount)
  
  // Build items list HTML
  const itemsListHtml = purchasedItems.map(item => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 0; font-size: 15px; color: #333333;">
        <strong>${item.areaName}</strong>${item.areaCode ? ` (${item.areaCode})` : ''}
        ${item.blockName ? `<br><span style="font-size: 13px; color: #666666;">Block: ${item.blockName}</span>` : ''}
        ${item.zoneName ? `<br><span style="font-size: 13px; color: #666666;">Zone: ${item.zoneName}</span>` : ''}
      </td>
      <td style="padding: 12px 0; text-align: center; font-size: 15px; color: #333333;">
        ${item.quantity}
      </td>
      <td style="padding: 12px 0; text-align: right; font-size: 15px; color: #333333;">
        ${new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(item.unitPrice)}
      </td>
    </tr>
  `).join('')
  
  // Build items list text
  const itemsListText = purchasedItems.map(item => 
    `- ${item.areaName}${item.areaCode ? ` (${item.areaCode})` : ''}${item.blockName ? ` - Block: ${item.blockName}` : ''}${item.zoneName ? ` - Zone: ${item.zoneName}` : ''} - Qty: ${item.quantity} - ${new Intl.NumberFormat('en-US', { style: 'currency', currency: displayCurrency }).format(item.unitPrice)}`
  ).join('\n')
  
  return {
    subject: 'Purchase Confirmation - PPIS Online',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Purchase Confirmation')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear ${userName},
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Thank you for your purchase! Your payment has been successfully processed and your documents are now available for download.
              </p>
              
              <div style="background-color: #e6f7f5; border-left: 4px solid #2CBCA6; padding: 20px; margin: 0 0 30px;">
                <p style="margin: 0 0 10px; font-size: 15px; font-weight: 600; color: #333333;">
                  Order Details:
                </p>
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Order ID:</strong> ${orderId}
                </p>
                <p style="margin: 0 0 5px; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Transaction ID:</strong> ${transactionId}
                </p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #666666;">
                  <strong>Total Amount:</strong> ${formattedAmount}
                </p>
              </div>
              
              <p style="margin: 0 0 15px; font-size: 16px; line-height: 1.6; color: #333333;">
                <strong>Purchased Documents:</strong>
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 30px; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                    <th style="padding: 12px 0; text-align: left; font-size: 14px; font-weight: 600; color: #333333;">Document</th>
                    <th style="padding: 12px 0; text-align: center; font-size: 14px; font-weight: 600; color: #333333;">Quantity</th>
                    <th style="padding: 12px 0; text-align: right; font-size: 14px; font-weight: 600; color: #333333;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsListHtml}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2" style="padding: 15px 0 0; text-align: right; font-size: 16px; font-weight: 600; color: #333333; border-top: 2px solid #e5e7eb;">
                      Total:
                    </td>
                    <td style="padding: 15px 0 0; text-align: right; font-size: 16px; font-weight: 600; color: #333333; border-top: 2px solid #e5e7eb;">
                      ${formattedAmount}
                    </td>
                  </tr>
                </tfoot>
              </table>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                You can now access and download your purchased documents from your account dashboard.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${siteUrl}/bidding-blocks" style="display: inline-block; padding: 15px 40px; background-color: #2CBCA6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View & Download Documents
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 10px; font-size: 16px; line-height: 1.6; color: #333333;">
                If you have any questions about your purchase, please don't hesitate to contact our support team.
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>The PPIS Team</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Purchase Confirmation - Your Documents Are Ready

Dear ${userName},

Thank you for your purchase! Your payment has been successfully processed and your documents are now available for download.

Order Details:
- Order ID: ${orderId}
- Transaction ID: ${transactionId}
- Total Amount: ${formattedAmount}

Purchased Documents:
${itemsListText}

Total: ${formattedAmount}

You can now access and download your purchased documents from your account dashboard.

View & Download Documents: ${siteUrl}/bidding-blocks

If you have any questions about your purchase, please don't hesitate to contact our support team.

Best regards,
The PPIS Team

${STANDARD_TEXT_FOOTER}
    `
  }
}

// Template for work unit decryption code email
export function getWorkUnitDecryptionCodeTemplate(reviewerEmail: string, code: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ppisonline.com'
  const portalUrl = `${siteUrl}/bid-backend-portal`
  
  return {
    subject: 'Your Work Units Decryption Code - PPIS',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Work Units Decryption Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          ${getStandardEmailHeader('Decryption Code')}
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                Dear Reviewer,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                You have been designated as a reviewer for the work units decryption process. Your unique decryption code is provided below.
              </p>
              
              <div style="background-color: #e6f7f5; border: 2px solid #2CBCA6; border-radius: 8px; padding: 20px; margin: 0 0 30px; text-align: center;">
                <p style="margin: 0 0 10px; font-size: 14px; font-weight: 600; color: #333333; text-transform: uppercase; letter-spacing: 1px;">
                  Your Decryption Code
                </p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; color: #0d9488; letter-spacing: 4px; font-family: 'Courier New', monospace;">
                  ${code}
                </p>
              </div>
              
              <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 0 0 30px;">
                <p style="margin: 0 0 10px; font-size: 15px; font-weight: 600; color: #92400e;">
                  Important Instructions:
                </p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #92400e;">
                  <li>Keep this code secure and confidential</li>
                  <li>Do not share this code with anyone</li>
                  <li>You will need to enter this code in the Bid Committee Portal</li>
                  <li>All reviewers must enter their codes before work units can be decrypted</li>
                </ul>
              </div>
              
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #333333;">
                To enter your code and participate in the decryption process, please visit the Bid Committee Portal:
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${portalUrl}" style="display: inline-block; padding: 15px 40px; background-color: #2CBCA6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Go to Bid Committee Portal
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 10px; font-size: 16px; line-height: 1.6; color: #333333;">
                If you have any questions or need assistance, please contact our support team.
              </p>
              
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333;">
                Best regards,<br>
                <strong>The PPIS Team</strong>
              </p>
            </td>
          </tr>
          ${getStandardEmailFooter()}
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
Work Units Decryption Code - PPIS

Dear Reviewer,

You have been designated as a reviewer for the work units decryption process. Your unique decryption code is provided below.

Your Decryption Code: ${code}

Important Instructions:
- Keep this code secure and confidential
- Do not share this code with anyone
- You will need to enter this code in the Bid Committee Portal
- All reviewers must enter their codes before work units can be decrypted

To enter your code and participate in the decryption process, please visit the Bid Committee Portal:
${portalUrl}

If you have any questions or need assistance, please contact our support team.

Best regards,
The PPIS Team

${STANDARD_TEXT_FOOTER}
    `
  }
}

