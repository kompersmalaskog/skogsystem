'use client'

// Veckoläget — innehållet, rent av data (ingen hämtning, inget sidhuvud): sidan ritar det,
// och samma modell ritas av PDF:en och bilden (_lib/veckolageDela.ts, ljus egen rendering — rörs inte).
// Ett KORT per spår: rubrik (meta) · stort tal (TYP.tal) · en mening (text) · två rutor Skördat/Skotat · flaskhals · veckan-rad (meta).
// Inga andra element: ingen orsak, inget per bolag, inga staplar.
import { AVSTAND, FARG, IKON, KORT, RADIE, TNUM, TYP } from '@/lib/design/tokens'
import type { SparVy, Ton, Veckolage } from '../_lib/veckolage'
import { Ikon } from './Ikon'

export const TON_FARG_VL: Record<Ton, string> = { gron: FARG.gron, orange: FARG.orange, neutral: FARG.text, dampad: FARG.text3 }

export default function VeckolageInnehall({ modell }: { modell: Veckolage }) {
  if (modell.spar.length === 0) {
    return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.xxl}px 0`, textAlign: 'center' }}>Ingen beställning och ingen produktion i månaden</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {modell.spar.map(s => <Spar key={s.typ} s={s} />)}
    </div>
  )
}

function Spar({ s }: { s: SparVy }) {
  return (
    <section aria-label={s.rubrik.typNamn} style={KORT}>
      <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.rubrik.typNamn}
        {s.rubrik.volym && <> · <strong style={{ color: FARG.text, fontWeight: TYP.listtitel.fontWeight }}>{s.rubrik.volym}</strong></>}
        {s.rubrik.bolag}
      </div>
      <div style={{ ...(s.stort.liten ? TYP.rubrik : TYP.tal), ...TNUM, color: TON_FARG_VL[s.stort.ton], marginTop: AVSTAND.s }}>
        {s.stort.text}
      </div>
      <div style={{ ...TYP.text, ...TNUM, color: FARG.text, marginTop: AVSTAND.xs }}>{s.mening}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
        <Ruta ikon="forest" label="Skördat" v={s.skordat} />
        <Ruta ikon="local_shipping" label="Skotat" v={s.skotat} />
      </div>
      {s.flaskhals && (
        <div role="note" style={{ marginTop: AVSTAND.m }}>
          <div style={{ ...TYP.listtitel, color: FARG.orange }}>{s.flaskhals.rubrik}</div>
          {s.flaskhals.rader.map((r, i) => (
            <div key={i} style={{ ...TYP.meta, ...TNUM, color: FARG.orange, marginTop: AVSTAND.xs }}>{r}</div>
          ))}
        </div>
      )}
      {s.veckan && <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.m }}>{s.veckan}</div>}
    </section>
  )
}

function Ruta({ ikon, label, v }: { ikon: string; label: string; v: SparVy['skordat'] }) {
  return (
    <div style={{ background: FARG.upphojt, borderRadius: RADIE.rad, padding: `${AVSTAND.m}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: FARG.text2 }}><Ikon namn={ikon} storlek={IKON.text} />{label}</div>
      <div style={{ ...TYP.rubrik, ...TNUM, color: TON_FARG_VL[v.ton], marginTop: AVSTAND.xs }}>{v.tal}</div>
      {v.under && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.under}</div>}
    </div>
  )
}
