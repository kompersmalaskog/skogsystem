'use client'

import Link from 'next/link'

const apps = [
  { href: '/uppfoljning', label: 'Uppföljning', icon: '📊', color: '#007AFF' },
  { href: '/maskinvy', label: 'Maskinvy', icon: '🚜', color: '#34C759' },
  { href: '/arbetsrapport', label: 'Arbetsrapport', icon: '📋', color: '#FF9500' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: '▶️', color: '#FF3B30' },
  { href: '/planering', label: 'Planering', icon: '📅', color: '#5856D6' },
  { href: '/planner', label: 'Planner', icon: '🗓️', color: '#FF2D55' },
  { href: '/objekt', label: 'Objekt', icon: '🌲', color: '#34C759' },
  { href: '/karta', label: 'Karta', icon: '🗺️', color: '#007AFF' },
  { href: '/oversikt', label: 'Översikt', icon: '👁️', color: '#5856D6' },
  { href: '/redigering', label: 'Redigering', icon: '✏️', color: '#FF9500' },
  { href: '/kalibrering', label: 'Kalibrering', icon: '⚙️', color: '#8E8E93' },
  { href: '/bestallningar', label: 'Beställningar', icon: '📦', color: '#FF3B30' },
  { href: '/helikopter', label: 'Helikopter', icon: '🚁', color: '#007AFF' },
  { href: '/forbattringsforslag', label: 'Förslag', icon: '💡', color: '#FFCC00' },
]

function getDatum() {
  const now = new Date()
  const dag = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][now.getDay()]
  const manad = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'][now.getMonth()]
  return `${dag} ${now.getDate()} ${manad}`
}

export default function Home() {
  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: '#000',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
      paddingBottom: 80,
    }}>
      {/* Blurry background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 20% 20%, rgba(88,86,214,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 60%, rgba(0,122,255,0.12) 0%, transparent 50%), radial-gradient(ellipse at 50% 90%, rgba(52,199,89,0.1) 0%, transparent 50%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '60px 20px 20px', maxWidth: 500, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.5)',
            textTransform: 'capitalize', letterSpacing: 0.3, marginBottom: 4,
          }}>
            {getDatum()}
          </div>
          <div style={{
            fontSize: 32, fontWeight: 700, color: '#fff',
            letterSpacing: -0.5,
          }}>
            Kompersmåla Skog
          </div>
        </div>

        {/* App grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '20px 12px',
        }}>
          {apps.map((app) => (
            <Link key={app.href} href={app.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <div style={{
                  width: 62, height: 62, borderRadius: 18,
                  background: app.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, lineHeight: 1,
                  boxShadow: `0 4px 16px ${app.color}44`,
                  transition: 'transform 0.15s',
                }}>
                  {app.icon}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, color: '#fff',
                  textAlign: 'center', lineHeight: 1.2,
                  maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {app.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
