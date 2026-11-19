'use client'

// LÄGET NU (2026-11-19, Martin: "snyggt detta är enkelt"): ett kort per spår och maskintyp. Ett ord med talet (Fattas 462 · Klar · 120 över),
// en stapel (full färg = gjort, svag = prognos, vitt streck = där vi borde vara idag) och två tal under. Beslutet — vilka trakter, i vilken
// ordning, vilken maskin — bor i Planera; ett tryck på kortet går dit. Egen skotning räknas redan i Skotat (tavla.ts).
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { AVSTAND, FARG, KORT, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { fmt } from '../_lib/format'
import type { Tavla as TavlaVy, TavlaBlock, TavlaSpar } from '../_lib/tavla'
import type { PlaneraRoll } from './Tavla'

const STAPEL_HOJD = 12
const idFarg = (ton: TavlaBlock['ton']) => (ton === 'orange' ? FARG.orange : ton === 'gron' ? FARG.gron : FARG.text2)
const pst = (x: number, av: number) => `${Math.max(0, Math.min(100, av > 0 ? (x / av) * 100 : 0))}%`

function LageKort({ spar, b, iFas, onOppna }: { spar: TavlaSpar; b: TavlaBlock; iFas: number | null; onOppna: () => void }) {
  const roll: PlaneraRoll = b.roll === 'skordare' ? 'skordare' : 'skotare'
  const farg = rollFarg(roll)
  const namn = roll === 'skordare' ? 'Skördare' : 'Skotare'
  return (
    <button type="button" onClick={onOppna} data-lage-kort={`${spar.typ}:${roll}`} aria-label={`${namn}, ${spar.namn.toLowerCase()}: ${b.ord}. Visa trakterna`}
      style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.m, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min - AVSTAND.s }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel }}>
          <span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, background: farg }} />{namn}
        </span>
        <span data-lage-ord="" style={{ ...TYP.rubrik, color: idFarg(b.ton), display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
          {b.ord}<Ikon namn="chevron_right" farg={FARG.text3} />
        </span>
      </span>
      <span aria-hidden="true" style={{ position: 'relative', display: 'block', height: STAPEL_HOJD, background: FARG.upphojt, borderRadius: STAPEL_HOJD / 2 }}>
        {b.landar != null && <span style={{ position: 'absolute', left: 0, top: 0, height: STAPEL_HOJD, width: pst(b.landar, spar.bestallt), background: farg, opacity: 0.35, borderRadius: STAPEL_HOJD / 2 }} />}
        <span style={{ position: 'absolute', left: 0, top: 0, height: STAPEL_HOJD, width: pst(b.nu, spar.bestallt), background: farg, borderRadius: STAPEL_HOJD / 2 }} />
        {iFas != null && <span data-i-fas="" style={{ position: 'absolute', left: `${Math.round(iFas * 100)}%`, top: -AVSTAND.xs, width: 2, height: STAPEL_HOJD + AVSTAND.s, background: FARG.text }} />}
      </span>
      {b.korAnnat.length > 0 && (
        <span data-kor-annat="" style={{ ...TYP.meta, color: FARG.orange }}>{b.korAnnat.join(' och ')} kör annat just nu — räknas inte in i prognosen</span>
      )}
      <span style={{ display: 'flex', justifyContent: 'space-between', ...TYP.meta, ...TNUM, color: FARG.text2 }}>
        <span>{fmt(b.nu)} gjort</span>
        {b.landar != null && <span>landar {b.ca ? 'ca ' : ''}{fmt(b.landar)}</span>}
      </span>
    </button>
  )
}

/** `iFas`: andelen av månadens arbetsdagar som gått (0–1), null när månaden inte pågår. */
export default function Lage({ tavla, iFas, onSpar }: { tavla: TavlaVy; iFas: number | null; onSpar: (typ: TavlaSpar['typ'], roll: PlaneraRoll) => void }) {
  const spar = tavla.spar.filter(s => s.bestallt > 0)
  if (spar.length === 0) return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Ingen beställning inlagd</div>
  return (
    <div data-lage="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', columnGap: AVSTAND.xxl, rowGap: AVSTAND.xl, alignItems: 'start' }}>
      {spar.map(s => (
        <Sektion key={s.typ} rubrik={`${s.namn} · beställt ${fmt(s.bestallt)}`} kort={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {s.block.map(b => <LageKort key={b.roll} spar={s} b={b} iFas={iFas} onOppna={() => onSpar(s.typ, b.roll === 'skordare' ? 'skordare' : 'skotare')} />)}
          </div>
        </Sektion>
      ))}
    </div>
  )
}
