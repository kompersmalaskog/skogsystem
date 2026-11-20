'use client'

// Tre tillstånd som SYNS olika: laddar (med vad), fel (vad man ska göra), tomt (varför + vad som fyller).
import Link from 'next/link'
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens'

export function Laddar({ vad }: { vad: string }) {
  return <div style={{ textAlign: 'center', padding: `${AVSTAND.xxl}px ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>Laddar {vad}…</div>
}

export function Fel({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.l, textAlign: 'center' }}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>Kunde inte läsa data – försök igen</div>
      <button type="button" onClick={onRetry} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  )
}

export function Tomt({ rubrik, text, knapp: k }: { rubrik: string; text?: string; knapp?: { text: string; href: string } }) {
  return (
    <div style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.s, textAlign: 'center' }}>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>
      {text && <div style={{ ...TYP.meta, color: FARG.text2 }}>{text}</div>}
      {k && <Link href={k.href} style={{ ...KNAPP.sekundar, textDecoration: 'none', marginTop: AVSTAND.s }}>{k.text}</Link>}
    </div>
  )
}
