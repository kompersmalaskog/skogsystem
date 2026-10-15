'use client'

// Byggstenarna för /helikopter, ur tokens: svarsraden på svart, sektionsetikett (TYP.micro) över ett KORT,
// rader (RAD) med linje mellan men inte efter den sista, mätare (6 px) med planstreck. Länkrader: components/ui/RadGrupp.
// Typ: tal TYP.tal, rubrik TYP.rubrik, radnamn TYP.listtitel, brödtext TYP.text, förklaring TYP.meta, etikett TYP.micro.
import { AVSTAND, FARG, IKON, KORT, RAD, RADIE, TNUM, TYP, VIKT } from '@/lib/design/tokens'
import type { Svar } from '../_lib/berakningar'
import { Ikon } from './Ikon'

/** Linjen under en rad ritas inte under den sista i en grupp. Läggs en gång i varje vys rot (`<style>{HK_CSS}</style>`). */
export const HK_CSS = '.hk-grupp > .hk-rad:last-child{border-bottom:none !important}'

const ELLIPS = { minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

/** En rad med flera rader text (namn + tal, mätare, förklaring) — RAD i en kolumn. */
export const RAD_KOLUMN = { ...RAD, flexDirection: 'column', alignItems: 'stretch', gap: AVSTAND.inuti } as const

/** Svarsraden: vyns rubrik, på svart bakgrund — inget kort. Ikon bara vid avvikelse; ok = grått. */
export function Svarsrad({ svar }: { svar: Svar }) {
  const indrag = svar.avvikelse ? IKON.rad + AVSTAND.inuti : 0 // ikonen + glappet, så andra raden linjerar med rubriken
  return (
    <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti }}>
        {svar.avvikelse && <Ikon namn="warning" farg={FARG.orange} />}
        <h2 style={{ margin: 0, ...TYP.rubrik, color: svar.avvikelse ? FARG.text : FARG.text2 }}>{svar.rubrik}</h2>
      </div>
      {svar.rad && <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs, paddingLeft: indrag }}>{svar.rad}</div>}
      {svar.varning && <div style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.xs, paddingLeft: indrag }}>{svar.varning}</div>}
    </section>
  )
}

/**
 * Etikett (TYP.micro) över ett KORT. `kort={false}` = raderna ligger direkt på ytan (i ett sheet/en panel, som redan är ett kort).
 * `foljdAvLankar` = en länkgrupp (RadGrupp) ligger direkt under: AVSTAND.rad i stället för AVSTAND.xl.
 */
export function Sektion({ rubrik, kort = true, foljdAvLankar, children }: { rubrik: string; kort?: boolean; foljdAvLankar?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={rubrik} style={{ marginBottom: foljdAvLankar ? AVSTAND.rad : AVSTAND.xl }}>
      <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>{rubrik}</div>
      <div className="hk-grupp" style={kort ? { ...KORT, paddingTop: 0, paddingBottom: 0 } : undefined}>{children}</div>
    </section>
  )
}

/** Ett KORT (utan sektionsetikett) — Uppföljning har ett per spår, med länkgruppen AVSTAND.rad under. */
export function Kort({ children }: { children: React.ReactNode }) {
  return <section style={{ ...KORT, marginBottom: AVSTAND.rad }}>{children}</section>
}

/** Mätare: 6 px, bakgrund FARG.fyllning, fyllning FARG.text2 (neutral) eller en statusfärg, planstreck FARG.text 2 px. `andel` och `planAndel` 0–1. */
export function Matare({ andel, planAndel, farg = FARG.text2 }: { andel: number; planAndel?: number | null; farg?: string }) {
  const pct = (v: number) => Math.min(100, Math.max(0, v * 100))
  return (
    <div style={{ position: 'relative', height: 6, borderRadius: RADIE.stapel, background: FARG.fyllning }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct(andel)}%`, background: farg, borderRadius: RADIE.stapel }} />
      {planAndel != null && planAndel > 0 && (
        <div style={{ position: 'absolute', top: -3, height: 12, width: 2, left: `calc(${pct(planAndel)}% - 1px)`, background: FARG.text }} aria-label="plan idag" />
      )}
    </div>
  )
}

export type TalTon = 'normal' | 'orange' | 'muted'

/** Rad: namn (listtitel) vänster · tal (text) höger + "av X" (meta). Under: mätare, sedan en förklaringsrad (meta). */
export function ListRad({ namn, tal, talTon = 'normal', av, andel, planAndel, orange, under, underMuted }: {
  namn: React.ReactNode
  tal: React.ReactNode
  talTon?: TalTon
  av?: string
  /** 0–1. undefined = ingen mätare. */
  andel?: number
  /** 0–1. Planstreck på mätaren. */
  planAndel?: number | null
  orange?: boolean
  under?: React.ReactNode
  underMuted?: boolean
}) {
  const talFarg = talTon === 'orange' ? FARG.orange : talTon === 'muted' ? FARG.text3 : FARG.text
  return (
    <div className="hk-rad" style={RAD_KOLUMN}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <span style={{ ...TYP.listtitel, color: FARG.text, ...ELLIPS }}>{namn}</span>
        <span style={{ ...TYP.text, ...TNUM, flexShrink: 0, color: talFarg, fontWeight: talTon === 'orange' ? VIKT.halvfet : VIKT.normal }}>
          {tal}{av && <span style={{ ...TYP.meta, color: FARG.text2 }}> av {av}</span>}
        </span>
      </div>
      {andel !== undefined && <Matare andel={andel} planAndel={planAndel} farg={orange ? FARG.orange : FARG.text2} />}
      {under != null && under !== '' && <div style={{ ...TYP.meta, ...TNUM, color: underMuted ? FARG.text3 : FARG.text2 }}>{under}</div>}
    </div>
  )
}

/** Mätarrad under spårets namn: ikon (22) + etikett (text) vänster, värde höger + "av X" (meta), mätare under. */
export function MatarRad({ ikon, label, varde, av, andel, planAndel, orange }: {
  ikon: string
  label: string
  varde: string
  av?: string
  /** 0–1. undefined = ingen mätare. */
  andel?: number
  planAndel?: number | null
  orange?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.inuti }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, ...TYP.text, color: FARG.text }}>
          <Ikon namn={ikon} />{label}
        </span>
        <span style={{ ...TYP.text, ...TNUM, flexShrink: 0, color: FARG.text }}>
          {varde}{av && <span style={{ ...TYP.meta, color: FARG.text2 }}> av {av}</span>}
        </span>
      </div>
      {andel !== undefined && <Matare andel={andel} planAndel={planAndel} farg={orange ? FARG.orange : FARG.text2} />}
    </div>
  )
}
