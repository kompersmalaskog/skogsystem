'use client'

// LÄGET NU (2026-11-23, Martin: "snyggt, kör på detta"): svaret först — EN mening — sedan fyra rutor mot beställningen och en tidslinje, vem gör vad dag för dag.
// En stapel som korsar den orange linjen (månadens slut) hinner inte. Ruta = ett tryck till Planera för spåret. Logiken är _lib/lage.ts; den här filen ritar.
// Förut: ett kort per spår och maskintyp med stapel, och en lista över trakterna under. Ordet och talet är samma som förut — bara upplägget är nytt.
import Sektion from '@/components/design/Sektion'
import { AVSTAND, FARG, KORT, RADIE, TNUM, TYP } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { fmt, relativTid } from '../_lib/format'
import { KLAR_TYP_NAMN, type KlarTyp } from '../_lib/klar'
import type { KorNu } from '../_lib/queries'
import { barSvar, lageRutor, lageSvar, type Ruta, type TidsBar, type TidsRad, type Tidslinje } from '../_lib/lage'
import type { Tavla as TavlaVy, TavlaSpar } from '../_lib/tavla'
import type { PlaneraRoll } from './Tavla'

/** Från så här bred sida (container query) står de fyra rutorna i en rad. */
const FYRA_RUTOR_PX = 800
const LAGE_CSS = `
.lage-rutor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${AVSTAND.rad}px; }
@container (min-width: ${FYRA_RUTOR_PX}px) { .lage-rutor { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.lage-maskiner { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${AVSTAND.rad}px; align-items: start; }
@container (min-width: ${FYRA_RUTOR_PX}px) { .lage-maskiner { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`

const STAPEL_HOJD = AVSTAND.s
const tonFarg = (ton: Ruta['ton']) => (ton === 'orange' ? FARG.orange : ton === 'gron' ? FARG.gron : FARG.text2)
const pst = (x: number, av: number) => `${Math.max(0, Math.min(100, av > 0 ? (x / av) * 100 : 0))}%`

function RutaKort({ r, onOppna }: { r: Ruta; onOppna: () => void }) {
  const farg = rollFarg(r.roll)
  const skala = Math.max(r.bestallt, r.landar ?? 0, r.nu, 1)
  return (
    <button type="button" onClick={onOppna} data-lage-kort={`${r.typ}:${r.roll}`} aria-label={`${r.rubrik}: ${r.ord} ${r.tal}. ${r.rad}. Visa trakterna`}
      style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.s, width: '100%', minWidth: 0, textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{r.rubrik}</span>
      </span>
      <span data-lage-ord="" style={{ ...TYP.tal, color: tonFarg(r.ton) }}>{r.ord}</span>
      {/* Raden reserveras även utan tal, så rutorna är lika höga. */}
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, minHeight: AVSTAND.l }}>{r.tal}</span>
      <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: STAPEL_HOJD, background: FARG.upphojt, borderRadius: STAPEL_HOJD / 2, marginTop: AVSTAND.xs }}>
        {r.landar != null && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pst(r.landar, skala), background: farg, opacity: 0.35, borderRadius: STAPEL_HOJD / 2 }} />}
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pst(r.nu, skala), background: farg, borderRadius: STAPEL_HOJD / 2 }} />
      </span>
      {r.korAnnat.length > 0 && <span data-kor-annat="" style={{ ...TYP.meta, color: FARG.orange }}>{r.korAnnat.join(' och ')} kör annat just nu — räknas inte in i prognosen</span>}
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>
        {r.rad}{r.markagare != null && r.markagare > 0 ? ` · markägaren skotar ${fmt(r.markagare)}` : ''}
      </span>
    </button>
  )
}

function TrakRad({ b, t }: { b: TidsBar; t: Tidslinje }) {
  const svar = barSvar(b, t)
  const farg = svar.ton === 'klar' ? FARG.text : FARG.orange
  return (
    <div data-tid-trakt={svar.ton} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.m, padding: `${AVSTAND.s}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
      <span style={{ ...TYP.text, color: FARG.text, minWidth: 0, overflowWrap: 'anywhere' }}>{b.namn}{b.vantar && <span data-tid-vantar="" style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>väntar på skördaren</span>}</span>
      <span style={{ ...TYP.meta, ...TNUM, color: farg, textAlign: 'right', flexShrink: 0, maxWidth: '55%' }}>
        {svar.klar}{svar.langd && <span style={{ display: 'block', color: FARG.text2 }}>{svar.langd}</span>}
      </span>
    </div>
  )
}

function MaskinKort({ r, t, nu }: { r: TidsRad; t: Tidslinje; nu?: KorNu }) {
  const farg = rollFarg(r.roll)
  return (
    <div data-tid-maskin={r.maskin_id} style={{ ...KORT, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, marginBottom: AVSTAND.xs }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
        {r.namn}<span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 400 }}>{r.roll === 'skordare' ? 'skördare' : 'skotare'}</span>
      </div>
      {nu && (
        <div data-kor-nu="" style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>
          {r.korAnnat ? 'Kör' : 'Senast'}: {nu.namn ?? 'okänt objekt'}{nu.typ && nu.typ !== 'slutavverkning' && nu.typ !== 'gallring' ? ` (${KLAR_TYP_NAMN[nu.typ as KlarTyp] ?? nu.typ})` : ''} · {relativTid(nu.tid ?? `${nu.datum}T12:00:00`)}
        </div>
      )}
      {r.korAnnat && <div data-kor-annat="" style={{ ...TYP.meta, color: FARG.text2 }}>Räknas inte in i prognosen.</div>}
      {r.barer.map(b => <TrakRad key={b.id} b={b} t={t} />)}
      {r.not && <div data-tid-not="" style={{ ...TYP.meta, color: FARG.text2, paddingTop: AVSTAND.s, borderTop: `1px solid ${FARG.linje}` }}>{r.not}</div>}
    </div>
  )
}

function Maskiner({ t, korNu }: { t: Tidslinje; korNu?: KorNu[] | null }) {
  return <div data-tidslinje="" className="lage-maskiner">{t.rader.map(r => <MaskinKort key={r.maskin_id} r={r} t={t} nu={korNu?.find(k => k.maskin_id === r.maskin_id)} />)}</div>
}

/** `tidslinje` = null: månaden pågår inte, eller köunderlaget saknas (då står ingen tom tidslinje — rutorna och svaret räcker). */
export default function Lage({ tavla, status, onSpar, tidslinje, korNu }: {
  tavla: TavlaVy; status: 'kommande' | 'pagaende' | 'avslutad'; onSpar: (typ: TavlaSpar['typ'], roll: PlaneraRoll) => void; tidslinje?: Tidslinje | null; korNu?: KorNu[] | null
}) {
  const svar = lageSvar(tavla, status)
  const rutor = lageRutor(tavla)
  if (rutor.length === 0) return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Ingen beställning inlagd</div>
  return (
    // Läget tar hela sidans bredd (gridColumn): rutorna och tidslinjen delar inte kolumn med "Mer".
    <div data-lage="" style={{ gridColumn: '1 / -1', minWidth: 0 }}>
      <style>{LAGE_CSS}</style>
      <div data-lage-svar="" style={{ marginBottom: AVSTAND.xl }}>
        <h2 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{svar.rad1}</h2>
        {svar.rad2 && <h2 style={{ margin: 0, ...TYP.titel, color: svar.avvikelse ? FARG.orange : FARG.gron }}>{svar.rad2}</h2>}
        {svar.under && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.text2 }}>{svar.under}</p>}
      </div>
      <Sektion rubrik="Mot beställningen" kort={false}>
        <div className="lage-rutor">
          {rutor.map(r => <RutaKort key={`${r.typ}:${r.roll}`} r={r} onOppna={() => onSpar(r.typ, r.roll)} />)}
        </div>
      </Sektion>
      {tidslinje && tidslinje.rader.length > 0 && (
        <Sektion rubrik="Vem kör vad" kort={false}>
          <Maskiner t={tidslinje} korNu={korNu} />
        </Sektion>
      )}
    </div>
  )
}
