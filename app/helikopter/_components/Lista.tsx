'use client'

// Den lugna liststilen (som v2:s Kapacitet-flik): svarsrad överst, sektioner,
// rader med namn/tal/stapel/underrad, listrader med chevron. Inga stora tal.
// Färg bara på det som avviker (orange). Planstreck i text-primary, aldrig svart.
import Link from 'next/link'
import { ChevronRight, TriangleAlert } from 'lucide-react'
import { T } from '@/lib/utbildning'
import type { Svar } from '../_lib/berakningar'

export const TEXT_MUTED = 'rgba(235,235,245,0.45)'
export const KANT = `0.5px solid ${T.sep}`

/** Svarsraden: ikon vid avvikelse + rubrik 17/500 + en rad 14 text-secondary. Ok = grått, ingen ikon. */
export function Svarsrad({ svar }: { svar: Svar }) {
  return (
    <section style={{ background: T.group, borderRadius: 12, padding: '14px 16px', marginBottom: 14, fontFamily: T.ff }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {svar.avvikelse && <TriangleAlert size={20} color={T.orange} strokeWidth={2.2} aria-label="avvikelse" style={{ flexShrink: 0 }} />}
        <div style={{ fontSize: 17, fontWeight: 500, color: svar.avvikelse ? T.t1 : T.t2, lineHeight: 1.3 }}>{svar.rubrik}</div>
      </div>
      {svar.rad && <div style={{ fontSize: 14, color: T.t2, marginTop: 4, lineHeight: 1.4, paddingLeft: svar.avvikelse ? 30 : 0 }}>{svar.rad}</div>}
    </section>
  )
}

export function Lista({ children }: { children: React.ReactNode }) {
  return <section style={{ background: T.group, borderRadius: 12, padding: '2px 16px 4px', marginBottom: 14, fontFamily: T.ff }}>{children}</section>
}

export function Sektion({ rubrik, children }: { rubrik: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: TEXT_MUTED, padding: '14px 0 2px' }}>{rubrik}</div>
      {children}
    </div>
  )
}

export type TalTon = 'normal' | 'orange' | 'muted'

/**
 * Rad: namn 15/500 vänster · tal 14 höger (orange 500 vid avvikelse) + "av X" i
 * text-secondary. Under: stapel 6 px (fyllning text-secondary, orange vid avvikelse),
 * valfritt planstreck 2×12 px i text-primary. Under stapeln: en rad 13 px.
 */
export function ListRad({ namn, tal, talTon = 'normal', av, andel, planAndel, orange, under, underMuted }: {
  namn: React.ReactNode
  tal: React.ReactNode
  talTon?: TalTon
  av?: string
  /** 0–1. undefined = ingen stapel. */
  andel?: number
  /** 0–1. Planstreck på stapeln. */
  planAndel?: number | null
  orange?: boolean
  under?: React.ReactNode
  underMuted?: boolean
}) {
  const talFarg = talTon === 'orange' ? T.orange : talTon === 'muted' ? TEXT_MUTED : T.t1
  return (
    <div style={{ padding: '12px 0', borderTop: KANT }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: T.t1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{namn}</span>
        <span style={{ fontSize: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: talFarg, fontWeight: talTon === 'orange' ? 500 : 400 }}>
          {tal}{av && <span style={{ color: T.t2, fontWeight: 400 }}> av {av}</span>}
        </span>
      </div>
      {andel !== undefined && (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, Math.max(0, andel * 100))}%`, background: orange ? T.orange : T.t2, borderRadius: 3 }} />
          {planAndel != null && planAndel > 0 && (
            <div style={{ position: 'absolute', top: -3, height: 12, width: 2, left: `calc(${Math.min(100, planAndel * 100)}% - 1px)`, background: T.t1, borderRadius: 1 }} aria-label="plan idag" />
          )}
        </div>
      )}
      {under != null && under !== '' && (
        <div style={{ fontSize: 13, color: underMuted ? TEXT_MUTED : T.t2, marginTop: andel !== undefined ? 8 : 4, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' }}>{under}</div>
      )}
    </div>
  )
}

/**
 * Mätarrad under en rubrikrad: ikon 16 px + etikett 14 px, tal höger (500) + "av X" i
 * text-secondary, under: stapel 6 px mot beställt med planstreck. Fyllning text-secondary
 * när värdet ligger på eller över plan idag, orange under.
 */
export function MatarRad({ ikon, label, varde, av, andel, planAndel, orange, forsta }: {
  ikon: React.ReactNode
  label: string
  varde: string
  av?: string
  /** 0–1. undefined = ingen stapel. */
  andel?: number
  planAndel?: number | null
  orange?: boolean
  forsta?: boolean
}) {
  return (
    <div style={{ marginTop: forsta ? 8 : 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: T.t1 }}>
          <span style={{ display: 'flex', flexShrink: 0 }}>{ikon}</span>{label}
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: T.t1, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {varde}{av && <span style={{ color: T.t2, fontWeight: 400 }}> av {av}</span>}
        </span>
      </div>
      {andel !== undefined && (
        <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginTop: 6, overflow: 'visible' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, Math.max(0, andel * 100))}%`, background: orange ? T.orange : T.t2, borderRadius: 3 }} />
          {planAndel != null && planAndel > 0 && (
            <div style={{ position: 'absolute', top: -3, height: 12, width: 2, left: `calc(${Math.min(100, planAndel * 100)}% - 1px)`, background: T.t1, borderRadius: 1 }} aria-label="plan idag" />
          )}
        </div>
      )}
    </div>
  )
}

/** Listrad 44 pt med chevron. Smakprov i text-secondary efter punkt. */
export function ListLank({ text, smakprov, href, onClick, orange }: { text: string; smakprov?: string; href?: string; onClick?: () => void; orange?: boolean }) {
  const stil: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 44,
    padding: '0 2px', background: 'transparent', border: 'none', borderTop: KANT, textAlign: 'left',
    color: orange ? T.orange : T.t1, fontSize: 15, fontFamily: T.ff, cursor: 'pointer', textDecoration: 'none',
  }
  const inre = (
    <>
      <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {text}{smakprov && <span style={{ color: T.t2 }}> · {smakprov}</span>}
      </span>
      <ChevronRight size={18} color={T.t2} aria-hidden="true" style={{ flexShrink: 0 }} />
    </>
  )
  if (href) return <Link href={href} style={stil}>{inre}</Link>
  return <button type="button" onClick={onClick} style={stil}>{inre}</button>
}
