'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// Status-typer med färger
const STATUS: Record<string, { label: string; farg: string; bg: string; ikon: string }> = {
  planerad: { label: 'Planerad', farg: '#94a3b8', bg: '#f1f5f9', ikon: '⬜' },
  skordning: { label: 'Skördning pågår', farg: '#f59e0b', bg: '#fef3c7', ikon: '🟡' },
  skotning: { label: 'Skotning pågår', farg: '#f97316', bg: '#ffedd5', ikon: '🟠' },
  klar: { label: 'Klar', farg: '#22c55e', bg: '#dcfce7', ikon: '✅' }
}

interface Objekt {
  id: number
  voNummer: string
  namn: string
  bolag: string
  typ: 'slut' | 'gallring'
  atgard: string
  volymPlanerad: number
  status: string
  maskiner: string[]
  ordning: number
  swerefX: number
  swerefY: number
  skordare: { volym: number | null; g15: number | null }
  skotare: { volym: number | null; g15: number | null }
}

// Konvertera SWEREF99 TM till WGS84
function sweref99ToWgs84(x: number, y: number): { lat: number; lng: number } {
  const axis = 6378137.0
  const flattening = 1.0 / 298.257222101
  const central_meridian = 15.0 * Math.PI / 180
  const scale = 0.9996
  const false_northing = 0.0
  const false_easting = 500000.0
  
  const e2 = flattening * (2.0 - flattening)
  const n = flattening / (2.0 - flattening)
  const a_roof = axis / (1.0 + n) * (1.0 + n * n / 4.0 + n * n * n * n / 64.0)
  
  const delta1 = n / 2.0 - 2.0 * n * n / 3.0 + 37.0 * n * n * n / 96.0 - n * n * n * n / 360.0
  const delta2 = n * n / 48.0 + n * n * n / 15.0 - 437.0 * n * n * n * n / 1440.0
  const delta3 = 17.0 * n * n * n / 480.0 - 37.0 * n * n * n * n / 840.0
  const delta4 = 4397.0 * n * n * n * n / 161280.0
  
  const Astar = e2 + e2 * e2 + e2 * e2 * e2 + e2 * e2 * e2 * e2
  const Bstar = -(7.0 * e2 * e2 + 17.0 * e2 * e2 * e2 + 30.0 * e2 * e2 * e2 * e2) / 6.0
  const Cstar = (224.0 * e2 * e2 * e2 + 889.0 * e2 * e2 * e2 * e2) / 120.0
  const Dstar = -(4279.0 * e2 * e2 * e2 * e2) / 1260.0
  
  const xi = (x - false_northing) / (scale * a_roof)
  const eta = (y - false_easting) / (scale * a_roof)
  
  const xi_prim = xi - 
    delta1 * Math.sin(2.0 * xi) * Math.cosh(2.0 * eta) - 
    delta2 * Math.sin(4.0 * xi) * Math.cosh(4.0 * eta) - 
    delta3 * Math.sin(6.0 * xi) * Math.cosh(6.0 * eta) - 
    delta4 * Math.sin(8.0 * xi) * Math.cosh(8.0 * eta)
    
  const eta_prim = eta - 
    delta1 * Math.cos(2.0 * xi) * Math.sinh(2.0 * eta) - 
    delta2 * Math.cos(4.0 * xi) * Math.sinh(4.0 * eta) - 
    delta3 * Math.cos(6.0 * xi) * Math.sinh(6.0 * eta) - 
    delta4 * Math.cos(8.0 * xi) * Math.sinh(8.0 * eta)
    
  const phi_star = Math.asin(Math.sin(xi_prim) / Math.cosh(eta_prim))
  const delta_lambda = Math.atan(Math.sinh(eta_prim) / Math.cos(xi_prim))
  
  const lon_radian = central_meridian + delta_lambda
  const lat_radian = phi_star + Math.sin(phi_star) * Math.cos(phi_star) * (
    Astar + 
    Bstar * Math.pow(Math.sin(phi_star), 2) + 
    Cstar * Math.pow(Math.sin(phi_star), 4) + 
    Dstar * Math.pow(Math.sin(phi_star), 6)
  )
  
  return {
    lat: lat_radian * 180.0 / Math.PI,
    lng: lon_radian * 180.0 / Math.PI
  }
}

declare global {
  interface Window {
    maplibregl: any
  }
}

export default function KartaPage() {
  const [valdtObjekt, setValdtObjekt] = useState<Objekt | null>(null)
  const [filter, setFilter] = useState<'alla' | 'slut' | 'gallring'>('alla')
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  
  // Demo-data - koordinater nära Tingsryd/Ryd
  const [objekt] = useState<Objekt[]>([
    {
      id: 1, voNummer: '880178-02', namn: 'Bjällerhult', bolag: 'Vida',
      typ: 'slut', atgard: 'Lrk', volymPlanerad: 1669,
      status: 'skordning', maskiner: ['Ponsse Scorpion', 'Ponsse Buffalo'], ordning: 1,
      swerefX: 6290000, swerefY: 480000,
      skordare: { volym: 823, g15: 20 },
      skotare: { volym: 540, g15: 18 }
    },
    {
      id: 2, voNummer: '883094-01', namn: 'Mossbrohult', bolag: 'Vida',
      typ: 'gallring', atgard: 'Första gallring', volymPlanerad: 125,
      status: 'planerad', maskiner: [], ordning: 1,
      swerefX: 6295000, swerefY: 485000,
      skordare: { volym: null, g15: null },
      skotare: { volym: null, g15: null }
    },
    {
      id: 3, voNummer: '882545-02', namn: 'Gässemåla', bolag: 'Vida',
      typ: 'gallring', atgard: 'Andra gallring', volymPlanerad: 93,
      status: 'skotning', maskiner: ['Ponsse Buffalo'], ordning: 2,
      swerefX: 6288000, swerefY: 478000,
      skordare: { volym: 93, g15: 8 },
      skotare: { volym: 45, g15: 5 }
    },
    {
      id: 4, voNummer: '879549-02', namn: 'Listerby', bolag: 'Södra',
      typ: 'slut', atgard: 'Au', volymPlanerad: 377,
      status: 'klar', maskiner: ['Ponsse Scorpion', 'Ponsse Buffalo'], ordning: 2,
      swerefX: 6292000, swerefY: 490000,
      skordare: { volym: 389, g15: 12 },
      skotare: { volym: 389, g15: 14 }
    },
    {
      id: 5, voNummer: '884079-01', namn: 'J-Hus', bolag: 'Vida',
      typ: 'slut', atgard: 'Lrk', volymPlanerad: 2180,
      status: 'planerad', maskiner: [], ordning: 3,
      swerefX: 6298000, swerefY: 482000,
      skordare: { volym: null, g15: null },
      skotare: { volym: null, g15: null }
    }
  ])
  
  // Beräkna produktivitet och tid kvar
  const berakna = (volymTotal: number, maskinData: { volym: number | null; g15: number | null }) => {
    if (!maskinData.volym || !maskinData.g15) return null
    
    const produktivitet = maskinData.volym / maskinData.g15
    const kvar = volymTotal - maskinData.volym
    const timKvar = kvar > 0 ? kvar / produktivitet : 0
    const procent = Math.round((maskinData.volym / volymTotal) * 100)
    
    return {
      volym: maskinData.volym,
      g15: maskinData.g15,
      produktivitet: Math.round(produktivitet * 10) / 10,
      kvar: Math.round(kvar),
      timKvar: Math.round(timKvar),
      procent: Math.min(100, procent)
    }
  }
  
  // Filtrera objekt
  const filtreradeObjekt = objekt.filter(o => {
    if (filter === 'alla') return true
    return o.typ === filter
  })
  
  // Ladda MapLibre GL JS
  useEffect(() => {
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link')
      link.id = 'maplibre-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
      document.head.appendChild(link)
    }

    if (!window.maplibregl) {
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
      script.onload = () => setMapReady(true)
      document.head.appendChild(script)
    } else {
      setMapReady(true)
    }
  }, [])

  // Initiera karta när MapLibre är redo
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current || !window.maplibregl) return

    const coords = objekt.map(o => sweref99ToWgs84(o.swerefX, o.swerefY))
    const centerLat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length
    const centerLng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length

    const map = new window.maplibregl.Map({
      container: mapRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; OpenStreetMap',
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#e5e7eb' } },
          { id: 'osm', type: 'raster', source: 'osm' },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 11,
      attributionControl: false,
    })

    map.addControl(new window.maplibregl.NavigationControl(), 'bottom-right')

    mapInstanceRef.current = map

    map.on('load', () => {
      updateMarkers()
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [mapReady])

  // Uppdatera markörer
  const updateMarkers = () => {
    if (!mapInstanceRef.current || !window.maplibregl) return

    // Ta bort gamla markörer
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Lägg till nya markörer
    filtreradeObjekt.forEach(obj => {
      const coords = sweref99ToWgs84(obj.swerefX, obj.swerefY)
      const status = STATUS[obj.status]

      const el = document.createElement('div')
      el.innerHTML = `
        <div style="position: relative; cursor: pointer;">
          <div style="
            position: absolute;
            top: -28px;
            left: 50%;
            transform: translateX(-50%);
            background: ${obj.typ === 'slut' ? '#f59e0b' : '#22c55e'};
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${obj.ordning}</div>
          <div style="
            width: 36px;
            height: 36px;
            background: ${status.farg};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 3px 10px rgba(0,0,0,0.3);
            border: 2px solid white;
          ">
            <span style="transform: rotate(45deg); font-size: 16px;">
              ${obj.typ === 'slut' ? '🪵' : '🌲'}
            </span>
          </div>
          <div style="
            position: absolute;
            top: 42px;
            left: 50%;
            transform: translateX(-50%);
            background: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            white-space: nowrap;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          ">${obj.namn}</div>
        </div>
      `

      el.addEventListener('click', () => setValdtObjekt(obj))

      const marker = new window.maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([coords.lng, coords.lat])
        .addTo(mapInstanceRef.current)

      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    if (mapReady && mapInstanceRef.current) {
      updateMarkers()
    }
  }, [filter, mapReady])
  
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#f0fdf4',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      
      {/* HEADER */}
      <div style={{ 
        background: 'white', 
        padding: '16px 20px', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
        position: 'relative',
        zIndex: 1000
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/" style={{ 
            width: '44px', height: '44px', 
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            borderRadius: '12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px',
            textDecoration: 'none'
          }}>🌲</Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '18px', color: '#1a1a1a' }}>Kompersmåla Skog</div>
            <div style={{ color: '#3b82f6', fontWeight: '600', fontSize: '14px' }}>🗺️ Karta</div>
          </div>
        </div>
        
        {/* Filter */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button
            onClick={() => setFilter('alla')}
            style={{
              padding: '8px 16px',
              background: filter === 'alla' ? '#3b82f6' : '#f1f5f9',
              color: filter === 'alla' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >Alla</button>
          <button
            onClick={() => setFilter('slut')}
            style={{
              padding: '8px 16px',
              background: filter === 'slut' ? '#f59e0b' : '#f1f5f9',
              color: filter === 'slut' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >🪵 Slutavv.</button>
          <button
            onClick={() => setFilter('gallring')}
            style={{
              padding: '8px 16px',
              background: filter === 'gallring' ? '#22c55e' : '#f1f5f9',
              color: filter === 'gallring' ? 'white' : '#64748b',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >🌲 Gallring</button>
        </div>
      </div>
      
      {/* KARTA */}
      <div style={{ position: 'relative', height: 'calc(100vh - 130px)' }}>
        <div 
          ref={mapRef} 
          style={{ width: '100%', height: '100%', background: '#e5e7eb' }}
        />
        
        {!mapReady && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'white',
            padding: '20px 30px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
          }}>
            Laddar karta...
          </div>
        )}
        
        {/* LEGEND */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          background: 'white',
          borderRadius: '12px',
          padding: '12px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 1000
        }}>
          <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: '#64748b' }}>STATUS</div>
          {Object.entries(STATUS).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ 
                width: '12px', height: '12px', 
                background: val.farg, 
                borderRadius: '50%' 
              }} />
              <span style={{ fontSize: '12px', color: '#1a1a1a' }}>{val.label}</span>
            </div>
          ))}
        </div>
        
        {/* INFO-PANEL */}
        {valdtObjekt && (() => {
          const skordData = berakna(valdtObjekt.volymPlanerad, valdtObjekt.skordare)
          const skotData = berakna(valdtObjekt.volymPlanerad, valdtObjekt.skotare)
          
          return (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              right: '20px',
              width: '340px',
              background: 'white',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              zIndex: 1000,
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'auto'
            }}>
              
              {/* Namn & Stäng */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  background: valdtObjekt.typ === 'slut' ? '#fef3c7' : '#d1fae5',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: '700',
                  color: valdtObjekt.typ === 'slut' ? '#92400e' : '#065f46'
                }}>
                  {valdtObjekt.ordning}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a1a' }}>
                    {valdtObjekt.namn}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {valdtObjekt.bolag} • VO: {valdtObjekt.voNummer}
                  </div>
                </div>
                
                <button
                  onClick={() => setValdtObjekt(null)}
                  style={{
                    width: '28px',
                    height: '28px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    fontSize: '14px',
                    flexShrink: 0
                  }}
                >✕</button>
              </div>
              
              {/* Planerad volym */}
              <div style={{ 
                background: '#f8fafc', 
                borderRadius: '10px', 
                padding: '10px', 
                marginBottom: '12px',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Planerad volym: </span>
                <span style={{ fontSize: '20px', fontWeight: '700' }}>{valdtObjekt.volymPlanerad}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}> m³</span>
              </div>
              
              {/* Status badges */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '4px 8px',
                  background: STATUS[valdtObjekt.status].bg,
                  color: STATUS[valdtObjekt.status].farg,
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600'
                }}>
                  {STATUS[valdtObjekt.status].ikon} {STATUS[valdtObjekt.status].label}
                </span>
                {valdtObjekt.atgard && (
                  <span style={{
                    padding: '4px 8px',
                    background: valdtObjekt.typ === 'slut' ? '#fef3c7' : '#d1fae5',
                    color: valdtObjekt.typ === 'slut' ? '#92400e' : '#065f46',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: '600'
                  }}>
                    {valdtObjekt.atgard}
                  </span>
                )}
              </div>
              
              {/* SKÖRDARE */}
              <div style={{ 
                background: '#fffbeb', 
                borderRadius: '12px', 
                padding: '12px',
                marginBottom: '10px',
                border: '1px solid #fde68a'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '10px'
                }}>
                  <span style={{ fontSize: '18px' }}>🪵</span>
                  <span style={{ fontWeight: '700', color: '#92400e' }}>Skördare</span>
                  {skordData && (
                    <span style={{ 
                      marginLeft: 'auto', 
                      fontSize: '12px', 
                      color: '#92400e',
                      fontWeight: '600'
                    }}>
                      {skordData.procent}% klart
                    </span>
                  )}
                </div>
                
                {skordData ? (
                  <>
                    <div style={{ 
                      height: '8px', 
                      background: '#fde68a', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '10px'
                    }}>
                      <div style={{ 
                        width: `${skordData.procent}%`,
                        height: '100%',
                        background: '#f59e0b',
                        borderRadius: '4px'
                      }} />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#92400e' }}>Producerat</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>{skordData.volym}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>m³</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#92400e' }}>Produktivitet</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>{skordData.produktivitet}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>m³/G15</div>
                      </div>
                      <div style={{ textAlign: 'center', background: '#fef3c7', borderRadius: '8px', padding: '4px' }}>
                        <div style={{ fontSize: '10px', color: '#92400e' }}>Kvar</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#92400e' }}>~{skordData.timKvar}</div>
                        <div style={{ fontSize: '9px', color: '#92400e' }}>timmar</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '10px' }}>
                    Ej påbörjad
                  </div>
                )}
              </div>
              
              {/* SKOTARE */}
              <div style={{ 
                background: '#ecfdf5', 
                borderRadius: '12px', 
                padding: '12px',
                marginBottom: '10px',
                border: '1px solid #a7f3d0'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  marginBottom: '10px'
                }}>
                  <span style={{ fontSize: '18px' }}>🚛</span>
                  <span style={{ fontWeight: '700', color: '#065f46' }}>Skotare</span>
                  {skotData && (
                    <span style={{ 
                      marginLeft: 'auto', 
                      fontSize: '12px', 
                      color: '#065f46',
                      fontWeight: '600'
                    }}>
                      {skotData.procent}% klart
                    </span>
                  )}
                </div>
                
                {skotData ? (
                  <>
                    <div style={{ 
                      height: '8px', 
                      background: '#a7f3d0', 
                      borderRadius: '4px',
                      overflow: 'hidden',
                      marginBottom: '10px'
                    }}>
                      <div style={{ 
                        width: `${skotData.procent}%`,
                        height: '100%',
                        background: '#22c55e',
                        borderRadius: '4px'
                      }} />
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#065f46' }}>Utkört</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>{skotData.volym}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>m³</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#065f46' }}>Produktivitet</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>{skotData.produktivitet}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8' }}>m³/G15</div>
                      </div>
                      <div style={{ textAlign: 'center', background: '#d1fae5', borderRadius: '8px', padding: '4px' }}>
                        <div style={{ fontSize: '10px', color: '#065f46' }}>Kvar</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#065f46' }}>~{skotData.timKvar}</div>
                        <div style={{ fontSize: '9px', color: '#065f46' }}>timmar</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px', padding: '10px' }}>
                    Ej påbörjad
                  </div>
                )}
              </div>
              
              {/* Maskiner */}
              {valdtObjekt.maskiner.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {valdtObjekt.maskiner.map((m, i) => (
                    <span key={i} style={{
                      padding: '4px 8px',
                      background: '#e0e7ff',
                      color: '#4f46e5',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: '600'
                    }}>
                      🚜 {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
