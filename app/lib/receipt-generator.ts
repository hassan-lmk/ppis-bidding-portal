import { jsPDF } from 'jspdf'

export interface PaymentReceiptData {
  basketId: string
  transactionId: string
  amount: number
  currency: string
  paymentDate: string
  paymentMethod?: string
  items?: Array<{
    name: string
    quantity?: number
    price: number
  }>
  customerName?: string
  customerEmail?: string
  companyName?: string
  address?: string
  type: 'bidding_blocks' | 'bid_application'
  areaName?: string // For bid applications
}

/**
 * Generates a PDF receipt for payment
 */
export async function generatePaymentReceipt(data: PaymentReceiptData): Promise<void> {
  const doc = new jsPDF()
  
  // Colors (typed as tuples for TypeScript spread operator)
  const primaryColor: [number, number, number] = [20, 184, 166] // teal-500
  const darkColor: [number, number, number] = [15, 118, 110] // teal-700
  const grayColor: [number, number, number] = [107, 114, 128] // gray-500
  const lightGrayColor: [number, number, number] = [243, 244, 246] // gray-100
  
  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  
  let yPos = margin
  
  // Load and add PPIS logo
  try {
    // Try to load logo from public folder
    const logoUrl = '/images/PPIS-logo-bg.png'
    // Use absolute URL if relative doesn't work (only in browser)
    const fullLogoUrl = typeof window !== 'undefined' && !logoUrl.startsWith('http')
      ? `${window.location.origin}${logoUrl}`
      : logoUrl
    
    const logoResponse = await fetch(fullLogoUrl)
    if (logoResponse.ok) {
      const logoBlob = await logoResponse.blob()
      const logoDataUrl = await blobToDataURL(logoBlob)
      
      // Add logo (max width 60mm, height auto, maintain aspect ratio)
      // Calculate height to maintain aspect ratio (assuming logo is roughly 3:1)
      const logoWidth = 60
      const logoHeight = 20
      doc.addImage(logoDataUrl, 'PNG', margin, yPos, logoWidth, logoHeight)
    } else {
      throw new Error('Logo not found')
    }
  } catch (error) {
    console.warn('Could not load logo, using text instead:', error)
    // Fallback: Add text logo
    doc.setFontSize(24)
    doc.setTextColor(...primaryColor)
    doc.setFont('helvetica', 'bold')
    doc.text('PPIS', margin, yPos + 10)
    doc.setFontSize(10)
    doc.setTextColor(...grayColor)
    doc.setFont('helvetica', 'normal')
    doc.text('Pakistan Petroleum Information System', margin, yPos + 18)
  }
  
  yPos += 35
  
  // Receipt Title
  doc.setFontSize(20)
  doc.setTextColor(...darkColor)
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Receipt', margin, yPos)
  
  yPos += 15
  
  // Receipt Number and Date
  doc.setFontSize(10)
  doc.setTextColor(...grayColor)
  doc.setFont('helvetica', 'normal')
  doc.text(`Receipt #: ${data.basketId}`, margin, yPos)
  doc.text(`Date: ${formatDate(data.paymentDate)}`, pageWidth - margin - 40, yPos)
  
  yPos += 10
  
  // Divider line
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(0.5)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  
  yPos += 15
  
  // Payment Details Section
  doc.setFontSize(12)
  doc.setTextColor(...darkColor)
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Details', margin, yPos)
  
  yPos += 10
  
  doc.setFontSize(10)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  
  // Transaction ID
  doc.setFont('helvetica', 'bold')
  doc.text('Transaction ID:', margin, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(data.transactionId, margin + 50, yPos)
  yPos += 7
  
  // Payment Method
  if (data.paymentMethod) {
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Method:', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.text(data.paymentMethod, margin + 50, yPos)
    yPos += 7
  }
  
  // Payment Type
  doc.setFont('helvetica', 'bold')
  doc.text('Payment Type:', margin, yPos)
  doc.setFont('helvetica', 'normal')
  const paymentTypeText = data.type === 'bidding_blocks' 
    ? 'Bidding Documents Purchase' 
    : 'Bid Application Fee'
  doc.text(paymentTypeText, margin + 50, yPos)
  yPos += 7
  
  // Area Name (for bid applications)
  if (data.areaName) {
    doc.setFont('helvetica', 'bold')
    doc.text('Area/Block:', margin, yPos)
    doc.setFont('helvetica', 'normal')
    doc.text(data.areaName, margin + 50, yPos)
    yPos += 7
  }
  
  yPos += 5
  
  // Items Section (for bidding blocks)
  if (data.items && data.items.length > 0) {
    doc.setFontSize(12)
    doc.setTextColor(...darkColor)
    doc.setFont('helvetica', 'bold')
    doc.text('Items Purchased', margin, yPos)
    yPos += 10
    
    // Table header
    doc.setFillColor(...lightGrayColor)
    doc.rect(margin, yPos - 5, contentWidth, 8, 'F')
    
    doc.setFontSize(9)
    doc.setTextColor(...darkColor)
    doc.setFont('helvetica', 'bold')
    doc.text('Item', margin + 2, yPos)
    doc.text('Quantity', margin + 100, yPos)
    doc.text('Price', margin + 140, yPos)
    doc.text('Total', pageWidth - margin - 30, yPos, { align: 'right' })
    
    yPos += 8
    
    // Items
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    
    data.items.forEach((item, index) => {
      if (yPos > pageHeight - 40) {
        doc.addPage()
        yPos = margin
      }
      
      const quantity = item.quantity || 1
      const itemTotal = item.price * quantity
      
      doc.text(item.name.substring(0, 40), margin + 2, yPos)
      doc.text(String(quantity), margin + 100, yPos)
      doc.text(formatCurrency(item.price, data.currency), margin + 140, yPos)
      doc.text(formatCurrency(itemTotal, data.currency), pageWidth - margin - 30, yPos, { align: 'right' })
      
      yPos += 7
    })
    
    yPos += 5
  }
  
  // Total Amount Section
  doc.setDrawColor(...primaryColor)
  doc.setLineWidth(1)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10
  
  doc.setFontSize(14)
  doc.setTextColor(...darkColor)
  doc.setFont('helvetica', 'bold')
  doc.text('Total Amount:', pageWidth - margin - 60, yPos, { align: 'right' })
  
  doc.setFontSize(16)
  doc.setTextColor(...primaryColor)
  doc.text(formatCurrency(data.amount, data.currency), pageWidth - margin, yPos, { align: 'right' })
  
  yPos += 15
  
  // Customer Information (if available)
  // Debug: Log receipt data to console
  console.log('[Receipt Generator] Customer data:', {
    companyName: data.companyName,
    address: data.address,
    customerName: data.customerName,
    customerEmail: data.customerEmail
  })
  
  if (data.customerName || data.customerEmail || data.companyName || data.address) {
    doc.setDrawColor(...primaryColor)
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 10
    
    doc.setFontSize(12)
    doc.setTextColor(...darkColor)
    doc.setFont('helvetica', 'bold')
    doc.text('Customer Information', margin, yPos)
    yPos += 10
    
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    
    // Company Name (display first if available)
    if (data.companyName && data.companyName.trim()) {
      doc.setFont('helvetica', 'bold')
      doc.text('Company:', margin, yPos)
      doc.setFont('helvetica', 'normal')
      // Handle long company names by splitting into multiple lines
      const companyLines = doc.splitTextToSize(data.companyName.trim(), contentWidth - 30)
      doc.text(companyLines, margin + 30, yPos)
      yPos += companyLines.length * 7
    }
    
    // Address (display second if available)
    if (data.address && data.address.trim()) {
      doc.setFont('helvetica', 'bold')
      doc.text('Address:', margin, yPos)
      doc.setFont('helvetica', 'normal')
      // Handle long addresses by splitting into multiple lines
      const addressLines = doc.splitTextToSize(data.address.trim(), contentWidth - 30)
      doc.text(addressLines, margin + 30, yPos)
      yPos += addressLines.length * 7
    }
    
    // Name (display third if available)
    if (data.customerName && data.customerName.trim()) {
      doc.setFont('helvetica', 'bold')
      doc.text('Name:', margin, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(data.customerName.trim(), margin + 30, yPos)
      yPos += 7
    }
    
    // Email (display last if available)
    if (data.customerEmail && data.customerEmail.trim()) {
      doc.setFont('helvetica', 'bold')
      doc.text('Email:', margin, yPos)
      doc.setFont('helvetica', 'normal')
      doc.text(data.customerEmail.trim(), margin + 30, yPos)
      yPos += 7
    }
  }
  
  // Footer
  const footerY = pageHeight - 40
  doc.setDrawColor(...lightGrayColor)
  doc.setLineWidth(0.5)
  doc.line(margin, footerY, pageWidth - margin, footerY)
  
  doc.setFontSize(8)
  doc.setTextColor(...grayColor)
  doc.setFont('helvetica', 'normal')
  // Center text by using pageWidth/2 as x position and align: 'center'
  doc.text('This is a computer generated slip.', pageWidth / 2, footerY + 8, { align: 'center' })
  doc.text('Please keep this receipt for your records.', pageWidth / 2, footerY + 15, { align: 'center' })
  
  // Save PDF
  const fileName = `PPIS-Receipt-${data.basketId}-${Date.now()}.pdf`
  doc.save(fileName)
}

/**
 * Helper function to convert blob to data URL
 */
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
  
  return `${currency} ${formatted}`
}

/**
 * Format date
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
