'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'

const ForestBackground = dynamic(() => import('./ForestBackground'), { ssr: false })
const SplashScreen = dynamic(() => import('./SplashScreen'), { ssr: false })

const apps: { href: string; label: string; icon: string; color: string; img?: string; badge?: string }[] = [
  { href: '/uppfoljning', label: 'Uppföljning', icon: '', color: '#007AFF', img: '/uppfoljning-icon.png' },
  { href: '/maskinvy', label: 'Maskinvy', icon: '🚜', color: '#34C759' },
  { href: '/maskinvy2', label: 'Skördare', icon: '🌲', color: '#34C759', badge: '2' },
  { href: '/maskinvy-ny', label: 'Synthetic Forest', icon: '🌿', color: '#00c48c' },
  { href: '/arbetsrapport', label: 'Arbetsrapport', icon: '', color: '#FF9500', img: '/arbetsrapport-icon.png' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: '▶️', color: '#FF3B30' },
  { href: '/planering', label: 'Planering', icon: '', color: '#5856D6', img: '/planering-icon.png' },
  { href: '/planner', label: 'Planner', icon: '🗓️', color: '#FF2D55' },
  { href: '/objekt', label: 'Objekt', icon: '🌲', color: '#34C759' },
  { href: '/karta', label: 'Karta', icon: '🗺️', color: '#007AFF' },
  { href: '/oversikt', label: 'Översikt', icon: '', color: '#5856D6', img: '/oversikt-icon.png' },
  { href: '/redigering', label: 'Redigering', icon: '✏️', color: '#FF9500' },
  { href: '/kalibrering', label: 'Kalibrering', icon: '⚙️', color: '#8E8E93' },
  { href: '/bestallningar', label: 'Beställningar', icon: '📦', color: '#FF3B30' },
  { href: '/helikopter', label: 'Helikopter', icon: '🚁', color: '#007AFF' },
  { href: '/helikopter-v2', label: 'Helikopter 2', icon: '🚁', color: '#007AFF', badge: '2' },
  { href: '/forbattringsforslag', label: 'Förslag', icon: '💡', color: '#FFCC00' },
  { href: '/maskin-service', label: 'Servicelogg', icon: '🔧', color: '#8E8E93' },
  { href: '/ledighet', label: 'Ledighet', icon: '🕐', color: '#5856D6' },
  { href: '/utbildning', label: 'Utbildning', icon: '🎓', color: '#34D399' },
  { href: '/affarsuppfoljning', label: 'Affärsuppföljning', icon: '💼', color: '#FF9500' },
]

function getDatum() {
  const now = new Date()
  const dag = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][now.getDay()]
  const manad = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'][now.getMonth()]
  return `${dag} ${now.getDate()} ${manad}`
}

type TimePhase = 'dawn' | 'day' | 'dusk' | 'night'

function getTimePhase(): TimePhase {
  const h = parseInt(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false }))
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 20) return 'dusk'
  return 'night'
}

const THEME_COLORS: Record<TimePhase, { baseBg: string; titleColor: string; titleShadow: string; datumColor: string }> = {
  dawn:  { baseBg: '#1a0e18', titleColor: '#fff5e8', titleShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 40px rgba(232,160,80,0.15)', datumColor: 'rgba(255,240,220,0.5)' },
  day:   { baseBg: '#0a1a0a', titleColor: '#fff8e0', titleShadow: '0 2px 12px rgba(0,0,0,0.3), 0 0 40px rgba(200,180,100,0.12)', datumColor: 'rgba(255,255,255,0.5)' },
  dusk:  { baseBg: '#10081a', titleColor: '#ffe8e0', titleShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 40px rgba(200,100,80,0.15)', datumColor: 'rgba(255,220,200,0.45)' },
  night: { baseBg: '#050510', titleColor: '#d8e0ff', titleShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 40px rgba(140,160,255,0.12)', datumColor: 'rgba(180,190,255,0.4)' },
}

export default function HomeClient() {
  const [phase, setPhase] = useState<TimePhase>('night');
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    setPhase(getTimePhase());
    const interval = setInterval(() => setPhase(getTimePhase()), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const theme = THEME_COLORS[phase];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: theme.baseBg,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
      paddingBottom: 20,
      transition: 'background 2s ease',
    }}>
      <style>{`
        @keyframes glow-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(34,197,94,0.5)); }
          50% { filter: drop-shadow(0 0 18px rgba(34,197,94,0.85)); }
        }
        .app-icon {
          transition: all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .app-icon.glow-icon {
          animation: glow-pulse 3s ease-in-out infinite;
        }
        .app-icon:hover {
          transform: translateY(-3px) scale(1.05);
          box-shadow: 0 12px 24px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.4) !important;
        }
        .app-icon:active {
          transform: translateY(2px) scale(0.98);
          box-shadow: 0 2px 6px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2) !important;
        }
      `}</style>

      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      <ForestBackground />

      <div style={{ position: 'relative', zIndex: 10, padding: '60px 20px 20px', maxWidth: 500, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 14, fontWeight: 500, color: theme.datumColor,
            textTransform: 'capitalize', letterSpacing: 0.5, marginBottom: 6,
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            transition: 'color 2s ease',
          }}>
            {getDatum()}
          </div>
          <div style={{
            fontSize: 38, fontWeight: 800, color: theme.titleColor,
            letterSpacing: -1,
            textShadow: theme.titleShadow,
            transition: 'color 2s ease, text-shadow 2s ease',
          }}>
            Kompersmåla Skog
          </div>
        </div>

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
                <div className={`app-icon${app.img ? ' glow-icon' : ''}`} style={{
                  position: 'relative',
                  width: 80, height: 80, borderRadius: 20,
                  background: app.img ? 'transparent' : app.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 38, lineHeight: 1,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
                  overflow: 'visible',
                }}>
                  {app.img ? <img src={app.img} alt={app.label} style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover' }} /> : app.icon}
                  {app.badge && (
                    <span style={{
                      position: 'absolute', bottom: 4, right: 4,
                      width: 22, height: 22, borderRadius: 11,
                      background: '#fff', color: app.color,
                      fontSize: 13, fontWeight: 800, lineHeight: '22px', textAlign: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }}>{app.badge}</span>
                  )}
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
