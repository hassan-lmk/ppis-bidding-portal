import { NextResponse } from 'next/server'

export async function GET() {
  // Check if bidding portal is enabled
  const isEnabled = process.env.ENABLE_BIDDING_PORTAL !== 'FALSE'
  
  return NextResponse.json({ 
    enabled: isEnabled 
  })
}

