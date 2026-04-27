'use client'
import dynamic from 'next/dynamic'
import Script from 'next/script'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// Lazy-load CesiumScene — Cesium-bundlen är ~2 MB gzipped och behövs bara här.
const CesiumScene = dynamic(() => import('./CesiumScene'), {
  ssr: false,
  loading: () => (
    <div style={{
      position: 'fixed', inset: 0, background: '#000', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 17,
    }}>
      Laddar Cesium…
    </div>
  ),
})

const CESIUM_VERSION = '1.140'
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`

export default function KorvyPage() {
  const [objektId, setObjektId] = useState<string | null>(null)
  const [missingToken, setMissingToken] = useState(false)
  const [cesiumReady, setCesiumReady] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    setObjektId(url.searchParams.get('objekt'))
    if (!process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) {
      setMissingToken(true)
    }
    // CDN sätter window.Cesium — kontrollera om den redan finns (HMR / återbesök)
    if ((window as any).Cesium) {
      ;(window as any).CESIUM_BASE_URL = CESIUM_BASE + '/'
      setCesiumReady(true)
    }
  }, [])

  if (missingToken) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#000', color: '#fff', padding: 24,
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Cesium-token saknas</div>
        <div style={{ fontSize: 15, color: '#8e8e93', maxWidth: 380, lineHeight: 1.5 }}>
          Sätt <code style={{ background: '#1c1c1e', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_CESIUM_ION_TOKEN</code> i .env.local för att aktivera 3D-vyn.
        </div>
        <Link href="/planering" style={{
          marginTop: 12, padding: '12px 24px', borderRadius: 12,
          background: '#0a84ff', color: '#fff', textDecoration: 'none', fontWeight: 600,
        }}>Tillbaka till planering</Link>
      </div>
    )
  }

  return (
    <>
      <link rel="stylesheet" href={`${CESIUM_BASE}/Widgets/widgets.css`} />
      <Script
        src={`${CESIUM_BASE}/Cesium.js`}
        strategy="afterInteractive"
        onLoad={() => {
          ;(window as any).CESIUM_BASE_URL = CESIUM_BASE + '/'
          setCesiumReady(true)
        }}
      />
      {cesiumReady ? <CesiumScene objektId={objektId} /> : (
        <div style={{
          position: 'fixed', inset: 0, background: '#000', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 17,
        }}>
          Laddar Cesium från CDN…
        </div>
      )}
    </>
  )
}
