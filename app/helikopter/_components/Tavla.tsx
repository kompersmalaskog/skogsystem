'use client'

// TAVLAN — ett kort per spår: Skördat och Skotat, en rad per maskin med NU och LANDAR, summan mot beställt sist.
// Allt som står här räknas i _lib/tavla.ts; den här filen ritar. Ett tryck på en maskin visar hennes trakter, ett tryck på en trakt flyttar den.
import { useState } from 'react'
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens'
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil'
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { fmt } from '../_lib/format'
import type { KlarRoll } from '../_lib/klar'
import { EGEN_SKOTNING } from '../_lib/tavla'
import type { FlyttVal, Tavla as TavlaVy, TavlaBlock, TavlaMaskin, TavlaOvrig, TavlaSpar, TavlaTrakt } from '../_lib/tavla'
import { StatusOrd } from './Status'

const LINJE = `1px solid ${FARG.linje}`
const TAL_KOLUMN = AVSTAND.xxl * 2 + AVSTAND.s
const rutnat = (medLandar: boolean) => ({
  display: 'grid', gridTemplateColumns: medLandar ? `minmax(0, 1fr) ${TAL_KOLUMN}px ${TAL_KOLUMN}px` : `minmax(0, 1fr) ${TAL_KOLUMN}px`, columnGap: AVSTAND.s, alignItems: 'center',
} as const)
const KNAPP_RAD = { width: '100%', background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' } as const
const HOGER = { textAlign: 'right', ...TNUM } as const

export type TraktVal = { objekt_id: string; roll: KlarRoll }

function RollPrick({ roll }: { roll: KlarRoll }) {
  return <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: AVSTAND.xs / 2, background: roll === 'skordare' ? ROLLFARG_SKORDARE : ROLLFARG_SKOTARE, flexShrink: 0 }} />
}

function TraktRad({ t, onTryck }: { t: TavlaTrakt; onTryck?: () => void }) {
  const inne = (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, paddingLeft: AVSTAND.l }}>
      <span style={{ ...TYP.text, color: t.utanfor ? FARG.text3 : FARG.text2, minWidth: 0, overflowWrap: 'anywhere' }}>{t.namn}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: t.efter ? FARG.orange : FARG.text2, flexShrink: 0 }}>
        {t.klar}{onTryck && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
      </span>
    </span>
  )
  if (!onTryck) return <div data-trakt={t.objekt_id}>{inne}</div>
  return <button type="button" onClick={onTryck} style={KNAPP_RAD} data-trakt={t.objekt_id} aria-label={`${t.namn}${t.klar ? `, klar ${t.klar}` : ''}. Flytta`}>{inne}</button>
}

function MaskinRad({ m, medLandar, oppen, onVaxla, onTrakt, dampad }: { m: TavlaMaskin; medLandar: boolean; oppen: boolean; onVaxla: () => void; onTrakt?: (v: TraktVal) => void; dampad?: boolean }) {
  const harTrakter = m.trakter.length > 0
  const rad = (
    <span style={{ ...rutnat(medLandar), minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...(dampad ? TYP.text : TYP.listtitel), color: dampad ? FARG.text2 : FARG.text }}>
          {!dampad && <RollPrick roll={m.roll} />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.namn}</span>
          {harTrakter && <Ikon namn={oppen ? 'expand_less' : 'expand_more'} storlek={IKON.text} farg={FARG.text3} />}
        </span>
        {m.stopp && <span style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.l }}>{m.stopp}</span>}
      </span>
      <span style={{ ...TYP.text, ...HOGER, fontWeight: dampad ? VIKT.normal : VIKT.fet, color: dampad ? FARG.text2 : FARG.text }} data-nu={m.maskin_id}>{fmt(m.nu)}</span>
      {medLandar && <span style={{ ...TYP.text, ...HOGER, color: FARG.text2 }} data-landar={m.maskin_id}>{m.landar == null ? '–' : fmt(m.landar)}</span>}
    </span>
  )
  return (
    <div style={{ borderTop: LINJE }} data-maskin={m.maskin_id}>
      {harTrakter ? <button type="button" onClick={onVaxla} aria-expanded={oppen} style={KNAPP_RAD}>{rad}</button> : rad}
      {oppen && (
        <div style={{ paddingBottom: AVSTAND.s }}>
          {m.trakter.map(t => <TraktRad key={`${t.objekt_id}:${t.roll}`} t={t} onTryck={onTrakt ? () => onTrakt({ objekt_id: t.objekt_id, roll: t.roll }) : undefined} />)}
        </div>
      )}
    </div>
  )
}

function Block({ b, medLandar, oppna, vaxla, onTrakt }: { b: TavlaBlock; medLandar: boolean; oppna: Set<string>; vaxla: (id: string) => void; onTrakt?: (v: TraktVal) => void }) {
  return (
    <div data-block={b.roll} style={{ paddingBottom: AVSTAND.s }}>
      <div style={{ ...rutnat(medLandar), ...TYP.micro, color: FARG.text3, padding: `${AVSTAND.m}px 0 ${AVSTAND.s}px` }}>
        <span style={{ color: FARG.text2 }}>{b.rubrik}</span>
        <span style={HOGER}>Nu</span>
        {medLandar && <span style={HOGER}>Landar</span>}
      </div>
      {b.maskiner.map(m => <MaskinRad key={m.maskin_id} m={m} medLandar={medLandar} oppen={oppna.has(`${b.roll}:${m.maskin_id}`)} onVaxla={() => vaxla(`${b.roll}:${m.maskin_id}`)} onTrakt={onTrakt} />)}
      {b.utan.map(u => {
        const inne = (
          <span style={{ ...rutnat(medLandar), minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{u.namn}</span>
              <StatusOrd ton="orange" ord="Ingen maskin" />
            </span>
            <span style={{ ...TYP.text, ...HOGER, color: FARG.text3 }}>{fmt(u.volym)}</span>
            {medLandar && <span style={{ display: 'flex', justifyContent: 'flex-end' }}>{onTrakt && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}</span>}
          </span>
        )
        return (
          <div key={u.objekt_id} style={{ borderTop: LINJE }} data-utan={u.objekt_id}>
            {onTrakt ? <button type="button" onClick={() => onTrakt({ objekt_id: u.objekt_id, roll: u.roll })} style={KNAPP_RAD} aria-label={`${u.namn}, ingen maskin. Välj maskin`}>{inne}</button> : inne}
          </div>
        )
      })}
      {b.markagare && <MaskinRad m={{ maskin_id: 'markagare', namn: 'Markägaren skotar', roll: 'skotare', nu: b.markagare.nu, landar: b.markagare.landar, ca: false, stopp: null, trakter: b.markagare.trakter }}
        dampad medLandar={medLandar} oppen={oppna.has(`${b.roll}:markagare`)} onVaxla={() => vaxla(`${b.roll}:markagare`)} onTrakt={onTrakt} />}
      <div style={{ ...rutnat(medLandar), borderTop: LINJE, minHeight: TRAFFYTA.min }} data-summa={b.roll}>
        <StatusOrd ton={b.ton} ord={b.ord} />
        <span style={{ ...TYP.text, ...HOGER, fontWeight: VIKT.fet, color: FARG.text }}>{fmt(b.nu)}</span>
        {medLandar && <span style={{ ...TYP.text, ...HOGER, fontWeight: VIKT.fet, color: FARG.text }}>{b.landar == null ? '–' : fmt(b.landar)}</span>}
      </div>
    </div>
  )
}

function SparKort({ s, oppna, vaxla, onTrakt }: { s: TavlaSpar; oppna: Set<string>; vaxla: (id: string) => void; onTrakt?: (v: TraktVal) => void }) {
  const medLandar = s.block.some(b => b.landar != null)
  return (
    <Sektion rubrik={s.bestallt > 0 ? `${s.namn} · beställt ${fmt(s.bestallt)}` : s.namn}>
      <div data-spar={s.typ}>
        <Block b={s.block[0]} medLandar={medLandar} oppna={oppna} vaxla={id => vaxla(`${s.typ}:${id}`)} onTrakt={onTrakt} />
        <Block b={s.block[1]} medLandar={medLandar} oppna={oppna} vaxla={id => vaxla(`${s.typ}:${id}`)} onTrakt={onTrakt} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, borderTop: LINJE, ...TYP.meta, color: FARG.text2 }} data-kvar={s.typ}>
          <span>Kvar att skota i skogen</span>
          <span style={{ ...TYP.text, ...TNUM, color: FARG.text }}>{fmt(s.kvarISkogen)}</span>
        </div>
      </div>
    </Sektion>
  )
}

function OvrigtKort({ rader, onTrakt }: { rader: TavlaOvrig[]; onTrakt?: (v: TraktVal) => void }) {
  return (
    <Sektion rubrik="GROT och övrigt">
      {rader.map((m, i) => (
        <div key={m.maskin_id} style={{ borderTop: i > 0 ? LINJE : 'none', padding: `${AVSTAND.s}px 0` }} data-ovrig={m.maskin_id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: AVSTAND.xxl, ...TYP.listtitel, color: FARG.text }}><RollPrick roll={m.roll} />{m.namn}</div>
          {m.trakter.map(t => <TraktRad key={`${t.objekt_id}:${t.roll}`} t={t} onTryck={onTrakt ? () => onTrakt({ objekt_id: t.objekt_id, roll: t.roll }) : undefined} />)}
        </div>
      ))}
    </Sektion>
  )
}

/** Korten i tavlan: ett per spår, och "GROT och övrigt" när en maskin bara har sådant. */
export default function Tavla({ tavla, onTrakt }: { tavla: TavlaVy; onTrakt?: (v: TraktVal) => void }) {
  const [oppna, setOppna] = useState<Set<string>>(() => new Set())
  const vaxla = (id: string) => setOppna(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Nyckeln bär spåret, så samma maskin kan stå öppen i ett spår och stängd i ett annat.
  const forSpar = (typ: string) => new Set([...oppna].filter(k => k.startsWith(`${typ}:`)).map(k => k.slice(typ.length + 1)))
  return (
    <>
      {tavla.spar.map(s => <SparKort key={s.typ} s={s} oppna={forSpar(s.typ)} vaxla={vaxla} onTrakt={onTrakt} />)}
      {tavla.ovrigt.length > 0 && <OvrigtKort rader={tavla.ovrigt} onTrakt={onTrakt} />}
    </>
  )
}

/** Vem ska ta trakten? En rad per maskin med vad valet ger. Inget flyttas utan knappen. */
export function FlyttaSheet({ open, onClose, namn, val, onFlytta }: {
  open: boolean; onClose: () => void; namn: string; val: FlyttVal[]; onFlytta: (maskinId: string) => Promise<string | null>
}) {
  const nu = val.find(v => v.nuvarande)?.maskin_id ?? null
  const [vald, setVald] = useState<string | null>(nu)
  const [lage, setLage] = useState<{ skickar: boolean; fel: string | null }>({ skickar: false, fel: null })
  if (!open) return null
  const valdRad = val.find(v => v.maskin_id === vald) ?? null
  const kan = valdRad != null && !valdRad.nuvarande && !lage.skickar
  async function flytta() {
    if (!valdRad) return
    setLage({ skickar: true, fel: null })
    const fel = await onFlytta(valdRad.maskin_id)
    if (fel) setLage({ skickar: false, fel })
    else { setLage({ skickar: false, fel: null }); onClose() }
  }
  return (
    <Sheet open onClose={onClose} title={namn}>
      <Sektion rubrik="Vem ska ta den?" kort={false}>
        {val.length === 0 && <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.m}px 0` }}>Ingen maskin kan ta den.</p>}
        {val.map((v, i) => {
          const pa = v.maskin_id === vald
          return (
            <button key={v.maskin_id} type="button" role="radio" aria-checked={pa} onClick={() => setVald(v.maskin_id)} data-val={v.maskin_id}
              style={{ ...KNAPP_RAD, display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, borderTop: i > 0 ? LINJE : 'none' }}>
              <span aria-hidden="true" style={{ width: AVSTAND.l + AVSTAND.xs, height: AVSTAND.l + AVSTAND.xs, borderRadius: '50%', boxSizing: 'border-box', border: `2px solid ${pa ? FARG.text : FARG.text3}`, background: pa ? FARG.text : 'transparent', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, ...TYP.listtitel, color: FARG.text }}>{v.namn}{v.nuvarande && <span style={{ ...TYP.meta, color: FARG.text2 }}> · nu</span>}</span>
              <StatusOrd ton={v.ton} ord={v.ord} />
            </button>
          )
        })}
      </Sektion>
      <button type="button" onClick={flytta} disabled={!kan} aria-busy={lage.skickar} style={{ ...KNAPP.primar, ...(kan ? null : INAKTIV) }} data-flytta="">
        {lage.skickar ? 'Flyttar…' : valdRad && !valdRad.nuvarande ? (valdRad.maskin_id === EGEN_SKOTNING ? 'Välj egen skotning' : `Flytta till ${valdRad.namn}`) : 'Flytta'}
      </button>
      {lage.fel && <p role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{lage.fel}</p>}
    </Sheet>
  )
}
