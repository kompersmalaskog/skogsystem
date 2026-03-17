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
      position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: '#0a0f0a',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
      paddingBottom: 20,
    }}>
      <style>{`
        @keyframes bgShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes glowDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.35; }
          33%      { transform: translate(30px, -20px) scale(1.1); opacity: 0.5; }
          66%      { transform: translate(-20px, 15px) scale(0.95); opacity: 0.3; }
        }
        @keyframes glowDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
          40%      { transform: translate(-25px, 25px) scale(1.15); opacity: 0.45; }
          70%      { transform: translate(15px, -10px) scale(0.9); opacity: 0.2; }
        }
        .app-icon {
          transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .app-icon:hover {
          transform: translateY(-4px) scale(1.05);
          box-shadow: 0 12px 24px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.4) !important;
        }
        .app-icon:active {
          transform: translateY(2px) scale(0.98);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2) !important;
        }
      `}</style>

      {/* Animated gradient background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(135deg, #0a0f0a 0%, #0d1f12 25%, #0a0a1a 50%, #0d1f12 75%, #0a0f0a 100%)',
        backgroundSize: '300% 300%',
        animation: 'bgShift 15s ease-in-out infinite',
      }} />

      {/* Floating glow points */}
      <div style={{
        position: 'fixed', top: '15%', left: '10%', width: 200, height: 200,
        borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(52,199,89,0.2) 0%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'glowDrift1 12s ease-in-out infinite',
      }} />
      <div style={{
        position: 'fixed', top: '55%', right: '5%', width: 180, height: 180,
        borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(88,86,214,0.2) 0%, transparent 70%)',
        filter: 'blur(40px)',
        animation: 'glowDrift2 14s ease-in-out infinite',
      }} />
      <div style={{
        position: 'fixed', bottom: '10%', left: '40%', width: 160, height: 160,
        borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%)',
        filter: 'blur(50px)',
        animation: 'glowDrift1 16s ease-in-out infinite reverse',
      }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '60px 20px 20px', maxWidth: 500, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.45)',
            textTransform: 'capitalize', letterSpacing: 0.5, marginBottom: 6,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            {getDatum()}
          </div>
          <div style={{
            fontSize: 38, fontWeight: 800, color: '#fff',
            letterSpacing: -1,
            textShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 30px rgba(52,199,89,0.08)',
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
                <div className="app-icon" style={{
                  width: 62, height: 62, borderRadius: 18,
                  background: app.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30, lineHeight: 1,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
                }}>
                  {app.icon}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 500, color: '#fff',
                  textAlign: 'center', lineHeight: 1.2,
                  maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
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
