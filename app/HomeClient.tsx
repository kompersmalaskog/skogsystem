'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function getDatum() {
  const now = new Date()
  const dag = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][now.getDay()]
  const manad = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'][now.getMonth()]
  return `${dag} ${now.getDate()} ${manad}`
}

const productionApps = [
  { href: '/uppfoljning', label: 'Uppföljning', icon: 'monitoring' },
  { href: '/maskinvy', label: 'Maskinvy', icon: 'visibility' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: 'power_settings_new' },
  { href: '/oversikt', label: 'Översikt', icon: 'dashboard' },
  { href: '/kalibrering', label: 'Kalibrering', icon: 'straighten' },
  { href: '/maskin-service', label: 'Servicelogg', icon: 'build' },
]

const adminApps = [
  { href: '/arbetsrapport', label: 'Arbetsrapport', icon: 'description' },
  { href: '/planering', label: 'Planering', icon: 'event_note' },
  { href: '/objekt', label: 'Objekt', icon: 'layers' },
  { href: '/redigering', label: 'Redigering', icon: 'edit' },
  { href: '/bestallningar', label: 'Beställningar', icon: 'shopping_cart' },
  { href: '/ledighet', label: 'Ledighet', icon: 'beach_access' },
  { href: '/utbildning', label: 'Utbildning', icon: 'school' },
  { href: '/forbattringsforslag', label: 'Förslag', icon: 'lightbulb' },
  { href: '/helikopter', label: 'Helikopter', icon: 'flight' },
  { href: '/helikopter-v2', label: 'Helikopter 2', icon: 'helicopter' },
  { href: '/affarsuppfoljning', label: 'Affärsuppföljning', icon: 'business_center' },
  { href: '/fordonsoversikt', label: 'Fordon', icon: 'local_shipping' },
  { href: '/avtal', label: 'Avtal', icon: 'receipt_long' },
  { href: '/personal', label: 'Personal', icon: 'badge' },
]

const ekonomiAppEntry = { href: '/ekonomi', label: 'Ekonomi', icon: 'payments' }
const adminAppEntry = { href: '/admin', label: 'Admin', icon: 'shield' }

function AppIcon({ href, label, icon, variant }: { href: string; label: string; icon: string; variant: 'production' | 'admin' }) {
  const gradientFrom = variant === 'production' ? '#80db7f' : '#adc6ff'
  const gradientTo = variant === 'production' ? '#4aa34f' : '#0566d9'
  const iconColor = variant === 'production' ? '#00390c' : '#002e6a'

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          transition: 'transform 150ms ease',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: iconColor }}>{icon}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 500, color: '#e4e2e4',
          textAlign: 'center', lineHeight: 1.3,
          maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {label}
        </span>
      </div>
    </Link>
  )
}

export default function HomeClient() {
  const [datum, setDatum] = useState('')
  const [roll, setRoll] = useState<string | null>(null)

  useEffect(() => {
    setDatum(getDatum())
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user?.email) return
      supabase.from('medarbetare').select('roll').eq('epost', user.email).single()
        .then(({ data }) => { if (data?.roll) setRoll(data.roll) })
    })
  }, [])

  const synligaAdminApps = (roll === 'chef' || roll === 'admin')
    ? [...adminApps, ekonomiAppEntry, adminAppEntry]
    : adminApps

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: '#000', fontFamily: "'Inter', sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{`
        .app-link:active > div > div:first-child {
          transform: scale(0.9);
        }
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
      `}</style>

      {/* Header */}
      <header style={{ paddingTop: 48, paddingBottom: 24, paddingLeft: 24, paddingRight: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', margin: '0 0 4px' }}>Kompersmåla Skog</h1>
        <div style={{ color: '#bfcab9', fontSize: 14, fontWeight: 500, textTransform: 'capitalize' }}>{datum}</div>
      </header>

      {/* Main */}
      <main style={{ padding: '0 24px 140px', maxWidth: 500, margin: '0 auto' }}>

        {/* Production */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: 'rgba(191,202,185,0.6)',
            marginBottom: 16, paddingLeft: 4,
          }}>Production</h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px 16px',
          }}>
            {productionApps.map(app => (
              <AppIcon key={app.href} {...app} variant="production" />
            ))}
          </div>
        </div>

        {/* Admin & Management */}
        <div>
          <h3 style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: 'rgba(191,202,185,0.6)',
            marginBottom: 16, paddingLeft: 4,
          }}>Admin &amp; Management</h3>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px 16px',
          }}>
            {synligaAdminApps.map(app => (
              <AppIcon key={app.href} {...app} variant="admin" />
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
