'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { MapPin, Clock, ShoppingCart, FileCheck, X, Download, Loader2 } from 'lucide-react'

interface Area {
  id: string
  name: string
  code: string
  status: string
  price: number
  geometry: any
  bid_submission_deadline: string | null
  zone_name: string
  block_name: string
  block_type: string
}

interface InteractiveMapPortalProps {
  openBlocksOnly?: boolean
}

export default function InteractiveMapPortal({ openBlocksOnly = true }: InteractiveMapPortalProps) {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const layersRef = useRef<{ [key: string]: L.Layer }>({})
  const provinceLayerRef = useRef<L.Layer | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasedAreaIds, setPurchasedAreaIds] = useState<Set<string>>(new Set())
  const [provincesData, setProvincesData] = useState<any>(null)

  useEffect(() => {
    fetchAreas()
    fetchProvinces()
  }, [])

  const fetchAreas = async () => {
    try {
      setLoading(true)

      // Fetch areas with geometry
      let query = supabase
        .from('areas')
        .select(`
          id, name, code, status, price, geometry, bid_submission_deadline,
          zones!inner(
            name,
            blocks!inner(name, type)
          )
        `)

      if (openBlocksOnly) {
        query = query.eq('status', 'Open')
      }

      const { data: areasData, error } = await query

      if (error) {
        console.error('Error fetching areas:', error)
        return
      }

      // Transform data
      const transformedAreas: Area[] = (areasData || [])
        .filter((a: any) => a.geometry)
        .map((a: any) => ({
          id: a.id,
          name: a.name,
          code: a.code,
          status: a.status,
          price: a.price || 0,
          geometry: a.geometry,
          bid_submission_deadline: a.bid_submission_deadline,
          zone_name: a.zones.name,
          block_name: a.zones.blocks.name,
          block_type: a.zones.blocks.type
        }))

      setAreas(transformedAreas)

      // Fetch purchased areas
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: downloads } = await supabase
          .from('area_downloads')
          .select('area_id')
          .eq('user_id', user.id)
          .eq('payment_status', 'completed')

        if (downloads) {
          setPurchasedAreaIds(new Set(downloads.map((d: any) => d.area_id)))
        }
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchProvinces = async () => {
    try {
      const response = await fetch('/api/sector-highlight/provinces')
      if (response.ok) {
        const data = await response.json()
        setProvincesData(data)
      } else {
        console.warn('Failed to fetch province outlines')
      }
    } catch (err) {
      console.error('Error fetching provinces:', err)
    }
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || loading) return

    // Initialize map centered on Pakistan offshore
    const map = L.map(mapRef.current, {
      center: [24.5, 66.5],
      zoom: 6,
      zoomControl: true
    })

    mapInstanceRef.current = map

    // White/light map tiles (CartoDB Positron)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map)

    L.control.scale().addTo(map)

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [loading])

  useEffect(() => {
    if (!mapInstanceRef.current || areas.length === 0) return

    // Clear existing layers
    Object.values(layersRef.current).forEach(layer => {
      mapInstanceRef.current?.removeLayer(layer)
    })
    layersRef.current = {}

    // Add areas to map
    areas.forEach(area => {
      try {
        const isPurchased = purchasedAreaIds.has(area.id)
        
        // Color based on status and purchase
        let fillColor = '#10B981' // Teal/Green for open
        if (isPurchased) {
          fillColor = '#3B82F6' // Blue for purchased
        }

        const geoJsonLayer = L.geoJSON(area.geometry, {
          style: {
            fillColor,
            fillOpacity: 0.4,
            color: fillColor,
            weight: 2
          },
          onEachFeature: (feature, layer) => {
            layer.bindTooltip(area.name, {
              permanent: false,
              direction: 'top',
              className: 'leaflet-tooltip-custom'
            })

            layer.on('click', () => {
              setSelectedArea(area)
              
              // Highlight selected
              Object.values(layersRef.current).forEach((l: any) => {
                if (l.setStyle) {
                  const areaId = Object.keys(layersRef.current).find(k => layersRef.current[k] === l)
                  const areaData = areas.find(a => a.id === areaId)
                  const isAreaPurchased = areaData ? purchasedAreaIds.has(areaData.id) : false
                  l.setStyle({
                    fillColor: isAreaPurchased ? '#3B82F6' : '#10B981',
                    fillOpacity: 0.4,
                    weight: 2
                  })
                }
              })

              ;(geoJsonLayer as any).setStyle({
                fillColor: '#F59E0B',
                fillOpacity: 0.7,
                weight: 3
              })
            })
          }
        })

        geoJsonLayer.addTo(mapInstanceRef.current!)
        layersRef.current[area.id] = geoJsonLayer

      } catch (error) {
        console.error(`Error rendering area ${area.name}:`, error)
      }
    })

    // Fit bounds
    if (Object.keys(layersRef.current).length > 0) {
      const group = L.featureGroup(Object.values(layersRef.current))
      mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [50, 50] })
    }
  }, [areas, purchasedAreaIds])

  // Separate useEffect for province boundaries layer
  useEffect(() => {
    if (!mapInstanceRef.current || !provincesData) return

    // Remove old province layer if exists
    if (provinceLayerRef.current) {
      try {
        if (mapInstanceRef.current.hasLayer(provinceLayerRef.current)) {
          mapInstanceRef.current.removeLayer(provinceLayerRef.current)
        }
      } catch (error) {
        console.warn('Error removing province layer:', error)
      }
    }

    // Add province outlines with light theme styling
    const provinceLayer = L.geoJSON(provincesData, {
      style: () => ({
        fillColor: 'transparent',
        fillOpacity: 0,
        color: '#64748b', // Darker gray for light theme
        weight: 2,
        opacity: 0.8,
        dashArray: '5, 5',
        interactive: false // Make provinces non-interactive
      }),
      onEachFeature: (feature: any, layer: any) => {
        const provinceName = feature.properties?.PROVINCE || 'Unknown'
        layer.bindTooltip(provinceName, {
          permanent: false,
          direction: 'top',
          className: 'leaflet-tooltip-custom'
        })
        // Disable all interactions to prevent selection/focus
        layer.off('click')
        layer.off('mousedown')
        layer.off('mouseup')
        if (layer.setStyle) {
          // Prevent style changes on interaction
          const originalSetStyle = layer.setStyle.bind(layer)
          layer.setStyle = function(style: any) {
            // Only allow setting style if it's our initial style
            if (style && style.interactive === false) {
              return originalSetStyle(style)
            }
          }
        }
      }
    })

    provinceLayer.addTo(mapInstanceRef.current)
    provinceLayerRef.current = provinceLayer
  }, [provincesData])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(price)
  }

  if (loading) {
    return (
      <div className="h-[700px] bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="relative h-[700px]">
      {/* Map Container */}
      <div ref={mapRef} className="h-full w-full rounded-xl" />

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[1000] border border-gray-200">
        <p className="text-xs font-semibold text-gray-800 mb-2">Legend</p>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded bg-emerald-500/40 border-2 border-emerald-500" />
            <span className="text-xs text-gray-700">Open for Bidding</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded bg-blue-500/40 border-2 border-blue-500" />
            <span className="text-xs text-gray-700">Purchased</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded bg-amber-500/70 border-2 border-amber-500" />
            <span className="text-xs text-gray-700">Selected</span>
          </div>
        </div>
      </div>

      {/* Block Count */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg px-4 py-2 z-[1000] border border-gray-200">
        <p className="text-sm font-semibold text-gray-800">{areas.length} Open Blocks</p>
      </div>

      {/* Selected Area Panel */}
      {selectedArea && (
        <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-[1000]">
          <Card className="shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{selectedArea.name}</h3>
                  <p className="text-sm text-gray-500">{selectedArea.code}</p>
                </div>
                <button
                  onClick={() => setSelectedArea(null)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="flex items-center space-x-2 mb-3">
                <Badge className="bg-emerald-50 text-emerald-700">Open</Badge>
                {purchasedAreaIds.has(selectedArea.id) && (
                  <Badge className="bg-blue-50 text-blue-700">Purchased</Badge>
                )}
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Zone</span>
                  <span className="font-medium">{selectedArea.zone_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Block</span>
                  <span className="font-medium">{selectedArea.block_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium capitalize">{selectedArea.block_type}</span>
                </div>
                {selectedArea.bid_submission_deadline && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Deadline</span>
                    <span className="font-medium text-amber-600">
                      {formatDate(selectedArea.bid_submission_deadline)}
                    </span>
                  </div>
                )}
              </div>

              {purchasedAreaIds.has(selectedArea.id) ? (
                <Button
                  onClick={() => router.push(`/bid-submission/${selectedArea.id}`)}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                >
                  <FileCheck className="w-4 h-4 mr-2" />
                  Apply for Bidding
                </Button>
              ) : (
                <Button
                  onClick={() => router.push('/bidding-blocks')}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Purchase ({formatPrice(selectedArea.price)})
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom Tooltip Style */}
      <style jsx global>{`
        .leaflet-tooltip-custom {
          background: rgba(255, 255, 255, 0.95);
          color: #1f2937;
          border: 1px solid rgba(229, 231, 235, 0.8);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 500;
        }
        .leaflet-tooltip-custom::before {
          border-top-color: rgba(255, 255, 255, 0.95);
        }
        .leaflet-container {
          background: #f9fafb !important;
        }
        .leaflet-control-zoom a {
          background-color: rgba(255, 255, 255, 0.95) !important;
          color: #374151 !important;
          border-color: rgba(229, 231, 235, 0.8) !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: rgba(249, 250, 251, 0.95) !important;
          color: #111827 !important;
        }
        .leaflet-control-scale-line {
          background: rgba(255, 255, 255, 0.95) !important;
          color: #374151 !important;
          border-color: rgba(229, 231, 235, 0.8) !important;
        }
        .leaflet-interactive {
          outline: none !important;
        }
        .leaflet-clickable {
          outline: none !important;
        }
        path.leaflet-interactive:focus {
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </div>
  )
}

