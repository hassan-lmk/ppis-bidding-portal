import { NextRequest, NextResponse } from 'next/server'
import { selectFromTable } from '../../../lib/supabase-https'

// Enable caching for public data - revalidate every 5 minutes
export const revalidate = 300 // 5 minutes cache

export async function GET(request: NextRequest) {
  try {
    // Fetch all blocks with their zones and areas for public access
    const blocks = await selectFromTable('blocks', '*', {}, 'type')
    
    if (!blocks) {
      return NextResponse.json(
        { error: 'Failed to fetch bidding blocks' },
        {
          status: 500,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // For each block, fetch its zones and areas
    const blocksWithZones = await Promise.all(
      blocks.map(async (block: any) => {
        try {
          const zones = await selectFromTable('zones', '*', { block_id: block.id })
          
          if (zones) {
            const zonesWithAreas = await Promise.all(
              zones.map(async (zone: any) => {
                try {
                  // Only fetch active areas (is_active = true)
                  const areas = await selectFromTable('areas', '*', { zone_id: zone.id, is_active: true })
                  return { ...zone, areas: areas || [] }
                } catch (error) {
                  console.error(`Error fetching areas for zone ${zone.id}:`, error)
                  return { ...zone, areas: [] }
                }
              })
            )
            return { ...block, zones: zonesWithAreas }
          }
          
          return { ...block, zones: [] }
        } catch (error) {
          console.error(`Error fetching zones for block ${block.id}:`, error)
          return { ...block, zones: [] }
        }
      })
    )

    return NextResponse.json(
      blocksWithZones,
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'CDN-Cache-Control': 'public, s-maxage=300',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=300',
        },
      }
    )

  } catch (error) {
    console.error('Unexpected error in public bidding blocks API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}








