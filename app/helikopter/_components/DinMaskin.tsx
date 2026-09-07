'use client'

// "Din maskin · Wisent" — inloggad förares pågående objekt: namn stort, dagar kvar, nästa, stapel.
// Visas bara när medarbetaren har en maskin kopplad (avgörs av föräldern).
import { T } from '@/lib/utbildning'
import { dagarText, fmt } from '../_lib/format'
import type { MaskinLage } from '../_lib/queries'
import { knapp } from './Tillstand'

type Props = { maskinNamn: string; lage: MaskinLage | null; fel: string | null; onRetry: () => void }

export default function DinMaskin({ maskinNamn, lage, fel, onRetry }: Props) {
  return (
    <>
      <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.2, color: T.t2, padding: '10px 4px 6px', fontFamily: T.ff }}>
        Din maskin · {maskinNamn}
      </div>
      <section style={{ background: T.group, borderRadius: 12, padding: '16px 16px 14px', marginBottom: 14, fontFamily: T.ff }}>
        {fel ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.t1, marginBottom: 12 }}>Kunde inte läsa din maskin – försök igen</div>
            <button type="button" onClick={onRetry} style={knapp}>Försök igen</button>
          </div>
        ) : !lage ? (
          <div style={{ fontSize: 15, color: T.t2 }}>Inget pågående objekt. Objektet visas här när det startats i Starta jobb.</div>
        ) : (
          <Innehall lage={lage} />
        )}
      </section>
    </>
  )
}

function Innehall({ lage }: { lage: MaskinLage }) {
  const dagarKvar = lage.takt_per_dag != null && lage.takt_per_dag > 0 ? Math.round(lage.kvar / lage.takt_per_dag) : null
  const under = dagarKvar != null
    ? `Ca ${dagarText(dagarKvar)} kvar${lage.nasta_namn ? ` · sedan ${lage.nasta_namn}` : ''}`
    : `${fmt(lage.kvar)} m³fub kvar · takt saknas${lage.nasta_namn ? ` · sedan ${lage.nasta_namn}` : ''}`
  const totalt = lage.gjort + lage.kvar
  const pct = totalt > 0 ? Math.min(100, (lage.gjort / totalt) * 100) : 0
  return (
    <>
      <div style={{ fontSize: 20, fontWeight: 700, color: T.t1 }}>{lage.namn || 'Objekt'}</div>
      <div style={{ fontSize: 14, color: T.t2, marginTop: 4 }}>{under}</div>
      <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'rgba(255,255,255,0.9)', borderRadius: 3 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.t2, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
        <span>{lage.roll === 'skordare' ? 'Skördat' : 'Skotat'} {fmt(lage.gjort)} m³fub</span>
        <span>{fmt(lage.kvar)} kvar</span>
      </div>
    </>
  )
}
