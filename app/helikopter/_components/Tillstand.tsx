'use client'

// Tre tillstånd som SYNS olika: laddar (med vad), fel (vad man ska göra), tomt (varför + vad som fyller).
import Link from 'next/link'
import { T } from '@/lib/utbildning'

export function Laddar({ vad }: { vad: string }) {
  return <div style={{ textAlign: 'center', padding: '48px 16px', color: T.t2, fontSize: 15, fontFamily: T.ff }}>Laddar {vad}…</div>
}

export function Fel({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ background: T.group, borderRadius: 12, padding: '24px 18px', textAlign: 'center', fontFamily: T.ff }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: T.t1, marginBottom: 16 }}>Kunde inte läsa data – försök igen</div>
      <button type="button" onClick={onRetry} style={knapp}>Försök igen</button>
    </div>
  )
}

export function Tomt({ rubrik, text, knapp: k }: { rubrik: string; text?: string; knapp?: { text: string; href: string } }) {
  return (
    <div style={{ background: T.group, borderRadius: 12, padding: '24px 18px', textAlign: 'center', fontFamily: T.ff }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: T.t1 }}>{rubrik}</div>
      {text && <div style={{ fontSize: 14, color: T.t2, marginTop: 6, lineHeight: 1.45 }}>{text}</div>}
      {k && <Link href={k.href} style={{ ...knapp, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 16, textDecoration: 'none' }}>{k.text}</Link>}
    </div>
  )
}

export const knapp: React.CSSProperties = {
  minHeight: 44, padding: '0 22px', borderRadius: 10, border: 'none',
  background: T.blue, color: '#fff', fontSize: 15, fontWeight: 600, fontFamily: T.ff, cursor: 'pointer',
}
