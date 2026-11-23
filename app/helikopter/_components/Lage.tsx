'use client'

// LÄGET NU (2026-11-23, Martin: "snyggt, kör på detta"): svaret först — EN mening — sedan fyra rutor mot beställningen och en tidslinje, vem gör vad dag för dag.
// En stapel som korsar den orange linjen (månadens slut) hinner inte. Ruta = ett tryck till Planera för spåret. Logiken är _lib/lage.ts; den här filen ritar.
// Förut: ett kort per spår och maskintyp med stapel, och en lista över trakterna under. Ordet och talet är samma som förut — bara upplägget är nytt.
import Sektion from '@/components/design/Sektion'
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { fmt } from '../_lib/format'
import { lageRutor, lageSvar, type Ruta, type TidsBar, type TidsRad, type Tidslinje } from '../_lib/lage'
import type { Tavla as TavlaVy, TavlaSpar } from '../_lib/tavla'
import type { PlaneraRoll } from './Tavla'

const STAPEL_HOJD = AVSTAND.s
const BAR_HOJD = TRAFFYTA.min - AVSTAND.s
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

/** Under så här stor andel av raden får namnet inte plats i stapeln — det står då under raden. */
const SMAL_ANDEL = 0.22
const arSmal = (b: TidsBar, n: number) => b.stil !== 'saknas' && Math.min(b.langd, n - b.start) / n < SMAL_ANDEL

function Stapel({ b, farg, n }: { b: TidsBar; farg: string; n: number }) {
  // Stapeln ritas aldrig utanför de dagar som visas; den som fortsätter längre än så slutar vid kanten.
  const bredd = Math.max(0, Math.min(b.langd, n - b.start))
  const bas = { position: 'absolute', top: 0, height: BAR_HOJD, left: `${(b.start / n) * 100}%`, width: `${(bredd / n) * 100}%`, borderRadius: RADIE.rad, display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.s}px`, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', ...TYP.meta, fontWeight: 600 } as const
  if (b.stil === 'saknas') return <span data-tid-stapel="saknas" title={b.text} style={{ ...bas, border: `1px dashed ${FARG.orange}`, color: FARG.orange }}>{b.text}</span>
  const fore = b.langd > 0 ? Math.min(1, (b.fore * b.langd) / Math.max(bredd, 1e-9)) : 0
  const bg = b.stil === 'efter' ? `linear-gradient(90deg, ${farg} ${fore * 100}%, ${FARG.orange} ${fore * 100}%)` : farg
  const smal = arSmal(b, n)
  return <span data-tid-stapel={b.stil} title={b.text} style={{ ...bas, background: bg, color: FARG.bg }}>{smal ? '' : b.text}</span>
}

function MaskinRad({ r, slut, antal }: { r: TidsRad; slut: number; antal: number }) {
  const farg = rollFarg(r.roll)
  return (
    <div data-tid-maskin={r.maskin_id} style={{ marginBottom: AVSTAND.m }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel, marginBottom: AVSTAND.s }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
        {r.namn}<span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 400 }}>{r.roll === 'skordare' ? 'skördare' : 'skotare'}</span>
      </div>
      {r.barer.length > 0 && (
        <div style={{ position: 'relative', height: BAR_HOJD }}>
          {r.barer.map(b => <Stapel key={b.id} b={b} farg={farg} n={antal} />)}
          <span aria-hidden="true" style={{ position: 'absolute', top: -AVSTAND.xs, bottom: -AVSTAND.xs, left: `${(slut / antal) * 100}%`, width: AVSTAND.xs / 2, marginLeft: -AVSTAND.xs / 4, background: FARG.orange, borderRadius: AVSTAND.xs / 4 }} />
        </div>
      )}
      {r.barer.some(b => arSmal(b, antal)) && <div data-tid-smal="" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{r.barer.filter(b => arSmal(b, antal)).map(b => b.namn).join(' · ')}</div>}
      {r.not && <div data-tid-not="" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{r.not}</div>}
    </div>
  )
}

function TidslinjeKort({ t }: { t: Tidslinje }) {
  const n = t.dagar.length
  // Etiketten står över linjen, men aldrig utanför kortet: ligger linjen nära en kant lutar etiketten inåt.
  const andel = t.slut / n
  const slutLage = andel > 0.8 ? { right: 0 } : andel < 0.2 ? { left: 0 } : { left: `${andel * 100}%`, transform: 'translateX(-50%)' }
  return (
    <div data-tidslinje="" style={{ ...KORT }}>
      <div style={{ position: 'relative', paddingTop: AVSTAND.l }}>
        <span data-tid-slut="" style={{ position: 'absolute', top: 0, ...slutLage, ...TYP.micro, color: FARG.orange, whiteSpace: 'nowrap' }}>Månadens slut</span>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, textAlign: 'center', marginBottom: AVSTAND.m }}>
          {t.dagar.map((d, i) => (
            <span key={i} style={{ display: 'flex', flexDirection: 'column', ...TYP.meta, ...TNUM, color: FARG.text2, minWidth: 0 }}>
              <span style={{ color: FARG.text }}>{d.dag}</span><span style={{ ...TYP.micro, color: FARG.text3 }}>{d.vdag}</span>
            </span>
          ))}
        </div>
      </div>
      {t.rader.map(r => <MaskinRad key={r.maskin_id} r={r} slut={t.slut} antal={n} />)}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l, ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.l }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: FARG.text2 }} />klar i november</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: FARG.orange }} />efter månadens slut</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, border: `1px dashed ${FARG.orange}`, boxSizing: 'border-box' }} />prognos saknas</span>
      </div>
    </div>
  )
}

/** `tidslinje` = null: månaden pågår inte, eller köunderlaget saknas (då står ingen tom tidslinje — rutorna och svaret räcker). */
export default function Lage({ tavla, status, onSpar, tidslinje }: {
  tavla: TavlaVy; status: 'kommande' | 'pagaende' | 'avslutad'; onSpar: (typ: TavlaSpar['typ'], roll: PlaneraRoll) => void; tidslinje?: Tidslinje | null
}) {
  const svar = lageSvar(tavla, status)
  const rutor = lageRutor(tavla)
  if (rutor.length === 0) return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Ingen beställning inlagd</div>
  return (
    <div data-lage="">
      <div data-lage-svar="" style={{ marginBottom: AVSTAND.xl }}>
        <h2 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{svar.rad1}</h2>
        {svar.rad2 && <h2 style={{ margin: 0, ...TYP.titel, color: svar.avvikelse ? FARG.orange : FARG.gron }}>{svar.rad2}</h2>}
        {svar.under && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.text2 }}>{svar.under}</p>}
      </div>
      <Sektion rubrik="Mot beställningen" kort={false}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.rad }}>
          {rutor.map(r => <RutaKort key={`${r.typ}:${r.roll}`} r={r} onOppna={() => onSpar(r.typ, r.roll)} />)}
        </div>
      </Sektion>
      {tidslinje && tidslinje.rader.length > 0 && (
        <Sektion rubrik="Vem gör vad, dag för dag" kort={false}>
          <TidslinjeKort t={tidslinje} />
        </Sektion>
      )}
    </div>
  )
}
