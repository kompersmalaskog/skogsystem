'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Hem', icon: 'home' },
  { href: '/redigering', label: 'Redigering', icon: 'edit' },
  { href: '/objekt', label: 'Objekt', icon: 'forest' },
  { href: '/planering', label: 'Planering', icon: 'calendar' },
  { href: '/oversikt', label: 'Översikt', icon: 'overview' },
  { href: '/uppfoljning', label: 'Uppföljning', icon: 'chart' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: 'play' },
  { href: '/forbattringsforslag', label: 'Förslag', icon: 'lightbulb' },
  { href: '/maskinvy', label: 'Maskinvy', icon: 'machine' },
]

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#fff' : '#666'
  const s = 20

  switch (icon) {
    case 'home':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    case 'edit':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )
    case 'forest':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M12 2L7 10h10L12 2z" />
          <path d="M12 8L5 18h14L12 8z" />
          <rect x="10" y="18" width="4" height="4" />
        </svg>
      )
    case 'calendar':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      )
    case 'overview':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'chart':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      )
    case 'play':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )
    case 'lightbulb':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
        </svg>
      )
    case 'machine':
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="6" cy="14" r="2" />
          <circle cx="18" cy="14" r="2" />
          <path d="M6 6V4" />
          <path d="M18 6V4" />
          <path d="M10 12h4" />
        </svg>
      )
    default:
      return null
  }
}

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '64px',
      backgroundColor: '#111',
      borderTop: '1px solid #222',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 1000,
    }}>
      {navItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              textDecoration: 'none',
              color: isActive ? '#fff' : '#666',
              fontSize: '9px',
              padding: '6px 4px',
              transition: 'color 0.2s',
            }}
          >
            <NavIcon icon={item.icon} active={isActive} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
