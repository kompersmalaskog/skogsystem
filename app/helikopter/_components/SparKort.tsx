'use client'

// Ett spår (gallring / slutavverkning) som kort. Samma skelett i alla tre flikar:
//   rubrik → ETT stort tal → stödrader → tunn stapel → (åtgärd) → (knapp)
// Färg används bara på det stora talet (och på "växer" i Läge); allt annat är text.
import Link from 'next/link'
import { ArrowRight, ChevronRight, TreePine, Trees } from 'lucide-react'
import { T } from '@/lib/utbildning'
import { TYP_NAMN, type Atgard } from '../_lib/berakningar'
import { fmt } from '../_lib/format'
import type { Typ } from '../_lib/queries'

export type Ton = 'gron' | 'orange' | 'neutral' | 'dampad'

export const TON_FARG: Record<Ton, string> = {
  gron: T.green,
  orange: T.orange,
  neutral: T.t1,
  dampad: T.t2,
}

export function TypIkon({ typ, size = 18 }: { typ: Typ; size?: number }) {
  const Ikon = typ === 'gallring' ? Trees : TreePine
  return <Ikon size={size} color={T.t2} strokeWidth={2} aria-hidden="true" />
}

/** "Gallring · **1 400 m³fub** till Vida och Södra" */
export function SparRubrik({ typ, bestallt, bolag }: { typ: Typ; bestallt: number; bolag: string[] }) {
  const till = bolag.length === 0 ? '' : bolag.length === 1 ? bolag[0] : `${bolag.slice(0, -1).join(', ')} och ${bolag[bolag.length - 1]}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: T.t2, fontFamily: T.ff, minWidth: 0 }}>
      <TypIkon typ={typ} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ color: T.t1, fontWeight: 600 }}>{TYP_NAMN[typ]}</span>
        {bestallt > 0 && <> · <span style={{ color: T.t1, fontWeight: 700 }}>{fmt(bestallt)} m³fub</span>{till && ` till ${till}`}</>}
      </span>
    </div>
  )
}

/** Det stora talet — huvudsaken, 44 pt. */
export function StortTal({ text, ton = 'neutral', under, liten }: { text: string; ton?: Ton; under?: string; liten?: boolean }) {
  return (
    <div style={{ margin: '12px 0 14px' }}>
      <div style={{ fontSize: liten ? 24 : 44, lineHeight: 1.05, fontWeight: 600, letterSpacing: -0.5, color: TON_FARG[ton], fontFamily: "'Fraunces', Georgia, serif", fontVariantNumeric: 'tabular-nums' }}>
        {text}
      </div>
      {under && <div style={{ fontSize: 14, color: T.t2, marginTop: 6, fontFamily: T.ff }}>{under}</div>}
    </div>
  )
}

/** Stödrad: (ikon) text till vänster, värde till höger. Ingen färg om inte `vardeTon` sätts. */
export function Rad({ ikon, text, varde, vardeTon = 'dampad', dampad }: { ikon?: React.ReactNode; text: React.ReactNode; varde?: React.ReactNode; vardeTon?: Ton; dampad?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '7px 0', fontFamily: T.ff, minHeight: 32 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: dampad ? T.t2 : T.t1, minWidth: 0 }}>
        {ikon && <span style={{ display: 'flex', flexShrink: 0, alignSelf: 'center' }}>{ikon}</span>}
        <span>{text}</span>
      </span>
      {varde != null && varde !== '' && (
        <span style={{ fontSize: 14, color: TON_FARG[vardeTon], textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{varde}</span>
      )}
    </div>
  )
}

/** Tunn stapel till beställt: skördat grått lager under, skotat ljust lager över. Valfritt plan-idag-streck. */
export function Stapel({ bestallt, skordat, skotat, plan }: { bestallt: number; skordat: number; skotat: number; plan?: number | null }) {
  const max = Math.max(bestallt, skordat, skotat, 1)
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(skordat), background: 'rgba(255,255,255,0.28)', borderRadius: 3 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(skotat), background: 'rgba(255,255,255,0.9)', borderRadius: 3 }} />
        {plan != null && plan > 0 && bestallt > 0 && (
          <div style={{ position: 'absolute', top: -1, bottom: -1, left: pct(plan), width: 2, background: T.orange }} aria-label="plan idag" />
        )}
      </div>
      {bestallt > 0 && bestallt < max && (
        <div style={{ position: 'relative', height: 0 }}>
          <div style={{ position: 'absolute', left: pct(bestallt), top: -8, width: 1, height: 10, background: 'rgba(255,255,255,0.5)' }} aria-label="beställt" />
        </div>
      )}
    </div>
  )
}

/** Åtgärdsruta — dämpad orange, pil. Bara när något ska göras. */
export function AtgardRuta({ atgard }: { atgard: Atgard }) {
  const inre = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,159,10,0.12)', border: `1px solid rgba(255,159,10,0.35)`, borderRadius: 10, padding: '12px 14px', marginTop: 14, minHeight: 44, fontFamily: T.ff }}>
      <ArrowRight size={18} color={T.orange} strokeWidth={2.2} aria-hidden="true" />
      <span style={{ flex: 1, fontSize: 14, color: T.t1, lineHeight: 1.4 }}>{atgard.text}</span>
      {atgard.href && <ChevronRight size={18} color={T.orange} aria-hidden="true" />}
    </div>
  )
  return atgard.href ? <Link href={atgard.href} style={{ textDecoration: 'none' }}>{inre}</Link> : inre
}

/** Länk-knapp längst ned i kortet: "Objekt ›" */
export function KortLank({ text, href, onClick }: { text: string; href?: string; onClick?: () => void }) {
  const stil: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44,
    marginTop: 12, padding: '0 2px', background: 'transparent', border: 'none', borderTop: `1px solid ${T.sep}`,
    color: T.blue, fontSize: 15, fontWeight: 600, fontFamily: T.ff, cursor: 'pointer', textDecoration: 'none',
  }
  const inre = <><span>{text}</span><ChevronRight size={18} aria-hidden="true" /></>
  if (href) return <Link href={href} style={stil}>{inre}</Link>
  return <button type="button" onClick={onClick} style={stil}>{inre}</button>
}

export function Kort({ children }: { children: React.ReactNode }) {
  return <section style={{ background: T.group, borderRadius: 12, padding: '16px 16px 12px', marginBottom: 14 }}>{children}</section>
}
