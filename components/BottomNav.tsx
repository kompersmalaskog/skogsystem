'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',system-ui,sans-serif";

const tabs = [
  { href: '/', label: 'Hem', icon: 'home' },
  { href: '/oversikt', label: 'Översikt', icon: 'map' },
  { href: '/planering', label: 'Planering', icon: 'event_note' },
  { href: '/objekt', label: 'Objekt', icon: 'layers' },
];

const morItems = [
  { href: '/redigering', label: 'Objektdetaljer', icon: 'edit' },
  { href: '/forbattringsforslag', label: 'Feedback', icon: 'feedback' },
  { href: '/uppfoljning', label: 'Uppföljning', icon: 'monitoring' },
  { href: '/helikopter-v2', label: 'Helikopter', icon: 'flight' },
  { href: '/starta-jobb', label: 'Starta jobb', icon: 'power_settings_new' },
  { href: '/arbetsrapport', label: 'Rapport', icon: 'description' },
  { href: '/maskinvy', label: 'Maskinvy', icon: 'visibility' },
  { href: '/affarsuppfoljning', label: 'Affär', icon: 'business_center' },
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
          position: 'fixed', bottom: 80, right: 8,
          background: 'rgba(13,13,15,.97)', backdropFilter: 'blur(24px)',
          borderRadius: 14, border: '1px solid rgba(255,255,255,0.05)',
          overflow: 'hidden', zIndex: 51, minWidth: 200,
        }}>
          {morItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setShowMore(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', minHeight: 44, textDecoration: 'none',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: active ? '#fff' : '#8e8e93',
                  fontSize: 15, fontWeight: active ? 600 : 400, fontFamily: ff,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color: active ? '#fff' : '#8e8e93' }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom nav bar */}
      <nav role="tablist" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#0c0c0e', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        paddingTop: 6,
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        zIndex: 50, fontFamily: ff,
      }}>
        {tabs.map((t) => {
          const active = pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href));
          return (
            <Link key={t.href} href={t.href}
              role="tab" aria-selected={active} aria-label={t.label}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '8px 0', minHeight: 48, textDecoration: 'none', cursor: 'pointer',
              }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24, color: active ? '#fff' : '#8e8e93', transition: 'color 0.15s', lineHeight: 1 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#fff' : '#8e8e93', transition: 'color 0.15s' }}>{t.label}</span>
            </Link>
          );
        })}

        {/* Mer button */}
        <button onClick={() => setShowMore(v => !v)}
          aria-label="Mer" aria-expanded={showMore}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, padding: '8px 0', minHeight: 48,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: ff,
          }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24, color: isMoreActive || showMore ? '#fff' : '#8e8e93', transition: 'color 0.15s', lineHeight: 1 }}>more_horiz</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: isMoreActive || showMore ? '#fff' : '#8e8e93', transition: 'color 0.15s' }}>Mer</span>
        </button>
      </nav>
    </>
  );
}
