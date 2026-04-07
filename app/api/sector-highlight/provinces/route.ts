import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const emsEndpoint = process.env.PRV_EMS_ENDPOINT || process.env.EMS_ENDPOINT || 'https://ems.lmkr.com:8443/geoserver/ems/ows'
    
    console.log('PRV_EMS_ENDPOINT from env:', process.env.PRV_EMS_ENDPOINT || 'not set')
    console.log('EMS_ENDPOINT from env (fallback):', process.env.EMS_ENDPOINT || 'not set')
    console.log('Using endpoint:', emsEndpoint)
    
    // Try both workspace names - ems and LMKR
    const workspaces = [
      { name: 'ems', layer: 'ems:shpProvinces' },
      { name: 'LMKR', layer: 'LMKR:shpProvinces' }
    ]
    
    for (const workspace of workspaces) {
      // Build endpoint URL - replace workspace in path if needed
      let endpointUrl = emsEndpoint
      // If endpoint contains /ems/ows, try replacing with current workspace
      if (endpointUrl.includes('/ems/ows') && workspace.name !== 'ems') {
        endpointUrl = endpointUrl.replace('/ems/ows', `/${workspace.name}/ows`)
      } else if (endpointUrl.includes('/LMKR/ows') && workspace.name !== 'LMKR') {
        endpointUrl = endpointUrl.replace('/LMKR/ows', `/${workspace.name}/ows`)
      }
      
      // Build the GeoServer WFS request URL for provinces
      const url = `${endpointUrl}?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(workspace.layer)}&outputFormat=application%2Fjson`
      
      console.log(`Trying provinces from GeoServer (workspace: ${workspace.name}):`, url)
    
      try {
        // Use Next.js/native fetch (no external node-fetch dependency).
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          console.warn(`Failed with ${workspace.name} workspace:`, response.status, response.statusText)
          // Try next workspace
          continue
        }
        
        // Get response text first
        const responseText = await response.text()
        
        // Check if response is actually XML (starts with <?xml)
        if (responseText.trim().startsWith('<?xml')) {
          // Try to extract error message from XML
          const xmlMatch = responseText.match(/<ServiceException[^>]*>([^<]+)<\/ServiceException>/i) ||
                           responseText.match(/<ows:ExceptionText[^>]*>([^<]+)<\/ows:ExceptionText>/i) ||
                           responseText.match(/<ExceptionText[^>]*>([^<]+)<\/ExceptionText>/i)
          const errorMsg = xmlMatch ? xmlMatch[1].trim() : 'Unknown error'
          console.warn(`XML error with ${workspace.name} workspace:`, errorMsg)
          // Try next workspace
          continue
        }
        
        // Parse as JSON
        let data
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          console.warn(`Failed to parse JSON with ${workspace.name} workspace, trying next...`)
          continue
        }
        
        // Validate it's a FeatureCollection
        if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
          console.warn(`Invalid GeoJSON structure with ${workspace.name} workspace, trying next...`)
          continue
        }
        
        // Success! Return the data
        console.log(`Successfully fetched ${data.features.length} province features using ${workspace.name} workspace`)
        return NextResponse.json(data)
      } catch (error) {
        console.warn(`Error with ${workspace.name} workspace:`, error)
        // Try next workspace
        continue
      }
    }
    
    // If we get here, all workspaces failed
    return NextResponse.json(
      { error: 'Failed to fetch provinces: Tried both ems and LMKR workspaces. The layer may not exist or may be in a different workspace.' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Unexpected error fetching provinces:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch provinces' },
      { status: 500 }
    )
  }
}

