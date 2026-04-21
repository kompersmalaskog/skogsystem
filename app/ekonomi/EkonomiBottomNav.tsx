'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Tab = { href: string; icon: string; label: string; match: (p: string) => boolean };

const TABS: Tab[] = [
  { href: '/ekonomi', icon: 'insights', label: 'Översikt', match: p => p === '/ekonomi' },
  { href: '/ekonomi/per-objekt', icon: 'layers', label: 'Per objekt', match: p => p.startsWith('/ekonomi/per-objekt') },
  { href: '/ekonomi/per-maskin', icon: 'construction', label: 'Per maskin', match: p => p.startsWith('/ekonomi/per-maskin') },
  { href: '/ekonomi/resultat', icon: 'account_balance', label: 'Resultat', match: p => p.startsWith('/ekonomi/resultat') },
  { href: '/ekonomi/installningar', icon: 'settings', label: 'Inställningar', match: p => p.startsWith('/ekonomi/installningar') },
];

export default function EkonomiBottomNav() {
  const pathname = usePathname() || '';
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, width: '100%', zIndex: 50,
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      padding: '12px 16px 24px',
      background: 'rgba(31,31,31,0.7)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: '16px 16px 0 0',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
      fontFamily: "'Inter', sans-serif",
    }}>
      {TABS.map(t => {
        const active = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} style={{ textDecoration: 'none', flex: 1, display: 'flex', justifyContent: 'center' }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: active ? '#adc6ff' : '#8b90a0',
              borderRadius: 12, height: 48, minWidth: 56, padding: 0,
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 22, marginBottom: 2,
                fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0",
              }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap' }}>{t.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
