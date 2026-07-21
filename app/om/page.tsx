'use client'

import { CHANGELOG, CURRENT_VERSION } from '@/lib/changelog'

// Bygg-SHA (från #219) — litet, för felsökning. Versionen ovanför är det läsbara.
const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA || 'dev').slice(0, 7)

export default function OmAppenPage() {
  const current = CHANGELOG[0]
  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',system-ui,sans-serif",
      WebkitFontSmoothing: 'antialiased',
      padding: '0 20px calc(env(safe-area-inset-bottom, 0px) + 60px)',
      maxWidth: 560,
      margin: '0 auto',
    }}>
      {/* Hero — aktuell version stort, datum diskret, SHA litet för felsökning */}
      <div style={{ textAlign: 'center', padding: '30px 0 34px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 1.5 }}>Version</div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '8px 0 4px' }}>{CURRENT_VERSION}</div>
        <div style={{ fontSize: 15, color: '#8e8e93', fontWeight: 500 }}>{current?.date}</div>
        <div style={{ fontSize: 11, color: '#48484a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginTop: 12, letterSpacing: 0.3 }}>{BUILD_SHA}</div>
      </div>

      {/* Ändringslogg — senaste överst */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8e8e93', margin: '0 0 12px', paddingLeft: 2 }}>Ändringar</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CHANGELOG.map((entry) => (
          <div key={entry.version} style={{
            background: '#141416',
            borderRadius: 16,
            padding: '16px 18px',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{entry.version}</span>
              <span style={{ fontSize: 13, color: '#8e8e93', fontWeight: 500 }}>{entry.date}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {entry.changes.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: '#30d158', fontSize: 15, lineHeight: 1.5, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
