'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function HomeButton() {
  const pathname = usePathname()
  if (pathname === '/') return null

  return (
    <Link href="/" style={{
      position: 'fixed',
      top: 12,
      left: 12,
      zIndex: 999,
      width: 36,
      height: 36,
      borderRadius: 10,
      background: 'rgba(255,255,255,0.1)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textDecoration: 'none',
      color: 'rgba(255,255,255,0.7)',
      fontSize: 18,
      lineHeight: 1,
      transition: 'background 0.15s',
    }}>
      ⌂
    </Link>
  )
}
