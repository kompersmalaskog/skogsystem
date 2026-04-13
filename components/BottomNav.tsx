'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif";

const tabs = [
  { href: '/', label: 'Hem', icon: '🏠' },
  { href: '/oversikt', label: 'Översikt', icon: '◎' },
  { href: '/planering', label: 'Planering', icon: '📋' },
  { href: '/objekt', label: 'Objekt', icon: '📦' },
];

const morItems = [
  { href: '/redigering', label: 'Redigering', icon: '✏️' },
  { href: '/forbattringsforslag', label: 'Förslag', icon: '💡' },
  { href: '/uppfoljning', label: 'Uppföljning', icon: '📊' },
  { href: '/helikopter-v2', label: 'Helikopter', icon: '🚁' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: '▶' },
  { href: '/arbetsrapport', label: 'Rapport', icon: '📝' },
  { href: '/maskinvy', label: 'Maskinvy', icon: '🔧' },
  { href: '/affarsuppfoljning', label: 'Affär', icon: '💼' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  const morePaths = morItems.map(i => i.href);
  const isMoreActive = morePaths.includes(pathname);

  return (
    <>
      {/* Backdrop to close More menu */}
      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
        />
      )}

      {/* More menu popup */}
      {showMore && (
        <div style={{
          position: 'fixed', bottom: 68, right: 8,
          background: 'rgba(13,13,15,.97)', backdropFilter: 'blur(24px)',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden', zIndex: 51, minWidth: 180,
          boxShadow: '0 -4px 24px rgba(0,0,0,.5)',
        }}>
          {morItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', textDecoration: 'none',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: active ? '#fafafa' : 'rgba(255,255,255,0.5)',
                  fontSize: 13, fontWeight: active ? 600 : 400, fontFamily: ff,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom nav bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0c0c0e', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', padding: '6px 0 env(safe-area-inset-bottom, 10px)',
        zIndex: 50, fontFamily: ff,
      }}>
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href));
          return (
            <Link key={t.href} href={t.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, padding: '4px 0', textDecoration: 'none', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 18, color: active ? '#fafafa' : 'rgba(255,255,255,0.2)', transition: 'color 0.15s', lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: active ? '#fafafa' : 'rgba(255,255,255,0.2)', letterSpacing: '0.02em', transition: 'color 0.15s' }}>{t.label}</span>
            </Link>
          );
        })}

        {/* Mer button */}
        <button onClick={() => setShowMore(v => !v)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 2, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff,
        }}>
          <span style={{ fontSize: 18, color: isMoreActive || showMore ? '#fafafa' : 'rgba(255,255,255,0.2)', transition: 'color 0.15s', lineHeight: 1 }}>⋯</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: isMoreActive || showMore ? '#fafafa' : 'rgba(255,255,255,0.2)', letterSpacing: '0.02em', transition: 'color 0.15s' }}>Mer</span>
        </button>
      </nav>
    </>
  );
}
