'use client'

// Veckoläget — innehållet, rent av data (ingen hämtning, inget sidhuvud): sidan ritar det,
// och samma modell ritas av PDF:en och bilden (_lib/veckolageDela.ts). Ska rymmas utan
// scroll på 390 px med två spår. Per spår, avdelade med 0,5 px linje:
//   rubrik 13 · stort tal 40 · en mening 15 · två rutor Skördat/Skotat · flaskhalsruta · veckan-rad 13.
// Inga andra element: ingen orsak, inget per bolag, inga staplar.
import { Trees, Truck } from 'lucide-react'
import { T } from '@/lib/utbildning'
import type { SparVy, Ton, Veckolage } from '../_lib/veckolage'

/** Färgerna i specen → appens tokens: surface-1 = T.group, text-secondary = T.t2, text-muted = #636366 (FARG.text3), bg-warning = orange 14 %, text-warning = T.orange. */
export const VL = {
  yta: T.group,
  sekundar: T.t2,
  dampad: '#636366',
  varningBg: 'rgba(255,159,10,0.14)',
  varning: T.orange,
  linje: `0.5px solid ${T.sep}`,
} as const

export const TON_FARG_VL: Record<Ton, string> = { gron: T.green, orange: T.orange, neutral: T.t1, dampad: VL.dampad }

export default function VeckolageInnehall({ modell }: { modell: Veckolage }) {
  if (modell.spar.length === 0) {
    return <div style={{ fontSize: 15, color: T.t2, padding: '32px 0', textAlign: 'center' }}>Ingen beställning och ingen produktion i månaden</div>
  }
  return (
    <div>
      {modell.spar.map((s, i) => <Spar key={s.typ} s={s} forsta={i === 0} />)}
    </div>
  )
}

function Spar({ s, forsta }: { s: SparVy; forsta: boolean }) {
  return (
    <section aria-label={s.rubrik.typNamn} style={{ padding: forsta ? '2px 0 14px' : '14px 0', borderTop: forsta ? 'none' : VL.linje }}>
      <div style={{ fontSize: 13, color: VL.sekundar, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {s.rubrik.typNamn}
        {s.rubrik.volym && <> · <strong style={{ color: T.t1, fontWeight: 600 }}>{s.rubrik.volym}</strong></>}
        {s.rubrik.bolag}
      </div>
      <div style={{ fontSize: s.stort.liten ? 22 : 40, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.05, color: TON_FARG_VL[s.stort.ton], marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        {s.stort.text}
      </div>
      <div style={{ fontSize: 15, color: T.t1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{s.mening}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <Ruta ikon={<Trees size={14} aria-hidden="true" />} label="Skördat" v={s.skordat} />
        <Ruta ikon={<Truck size={14} aria-hidden="true" />} label="Skotat" v={s.skotat} />
      </div>
      {s.flaskhals && (
        <div role="note" style={{ background: VL.varningBg, borderRadius: 12, padding: '12px 14px', marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: VL.varning }}>{s.flaskhals.rubrik}</div>
          {s.flaskhals.rader.map((r, i) => (
            <div key={i} style={{ fontSize: 14, color: VL.varning, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{r}</div>
          ))}
        </div>
      )}
      {s.veckan && <div style={{ fontSize: 13, color: VL.sekundar, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{s.veckan}</div>}
    </section>
  )
}

function Ruta({ ikon, label, v }: { ikon: React.ReactNode; label: string; v: SparVy['skordat'] }) {
  return (
    <div style={{ background: VL.yta, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: VL.dampad }}>{ikon}{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: TON_FARG_VL[v.ton], marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{v.tal}</div>
      {v.under && <div style={{ fontSize: 12, color: VL.sekundar, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.under}</div>}
    </div>
  )
}
