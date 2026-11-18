'use client'

// TAVLAN — uppifrån: Vad kan du göra? · Räcker trakterna? · ett kort per spår med EN rad för Skördare och EN för Skotare (stapel mot beställt, gjort och prognos);
// maskiner, trakter och klar-datum ligger bakom ett tryck på raden. Förut: ett kort per spår: Skördat och Skotat, var sin STAPEL mot beställt (ljust = gjort, mörkare = hinns, luckan = fattas),
// domen i ord bredvid rubriken, och under stapeln en rad per maskin med NU och MÅNADENS SLUT.
// Trakter utan maskin och det som körts utanför beställningen står i ord, aldrig i talkolumnerna. Kvar i skogen har ett eget kort.
// Allt som står här räknas i _lib/tavla.ts; den här filen ritar. Ett tryck på en maskin visar hennes trakter, ett tryck på en trakt flyttar den.
import { useState } from 'react'
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TNUM, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens'
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil'
import { Sheet } from '@/components/Sheet'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { fmt } from '../_lib/format'
import type { KlarRoll } from '../_lib/klar'
import { EGEN_SKOTNING, dagarText } from '../_lib/tavla'
import type { FlyttVal, Tavla as TavlaVy, TavlaBehov, TavlaBlock, TavlaGor, TavlaMaskin, TavlaOvrig, TavlaSkot, TavlaSpar, TavlaTakt, TavlaTrakt } from '../_lib/tavla'
import { StatusOrd } from './Status'

const LINJE = `1px solid ${FARG.linje}`
// Rubriken "Månadens slut" bryts på två rader i sin kolumn, så kolumnerna kan vara smala och namnet får plats på telefon.
const NU_KOLUMN = AVSTAND.xxl * 2
const SLUT_KOLUMN = AVSTAND.xxl * 2 + AVSTAND.l
const rutnat = (medLandar: boolean) => ({
  display: 'grid', gridTemplateColumns: medLandar ? `minmax(0, 1fr) ${NU_KOLUMN}px ${SLUT_KOLUMN}px` : `minmax(0, 1fr) ${NU_KOLUMN}px`, columnGap: AVSTAND.s, alignItems: 'center',
} as const)
const STAPEL_HOJD = AVSTAND.s
const KNAPP_RAD = { width: '100%', background: 'none', border: 'none', padding: 0, margin: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' } as const
const HOGER = { textAlign: 'right', ...TNUM } as const

export type TraktVal = { objekt_id: string; roll: KlarRoll }

function RollPrick({ roll }: { roll: KlarRoll }) {
  return <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: AVSTAND.xs / 2, background: roll === 'skordare' ? ROLLFARG_SKORDARE : ROLLFARG_SKOTARE, flexShrink: 0 }} />
}

function TraktRad({ t, onTryck }: { t: TavlaTrakt; onTryck?: () => void }) {
  const inne = (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, paddingLeft: AVSTAND.l }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, padding: t.volym ? `${AVSTAND.xs}px 0` : 0 }}>
        <span style={{ ...TYP.text, color: t.utanfor ? FARG.text3 : FARG.text2, overflowWrap: 'anywhere' }}>{t.namn}</span>
        {t.volym && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3, textAlign: 'left' }} data-trakt-volym={t.objekt_id}>{t.volym}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: t.efter ? FARG.orange : FARG.text2, flexShrink: 0 }}>
        {t.klar}{onTryck && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
      </span>
    </span>
  )
  if (!onTryck) return <div data-trakt={t.objekt_id}>{inne}</div>
  return <button type="button" onClick={onTryck} style={KNAPP_RAD} data-trakt={t.objekt_id} aria-label={`${t.namn}${t.klar ? `, klar ${t.klar}` : ''}. Flytta`}>{inne}</button>
}

function MaskinRad({ m, medLandar, oppen, onVaxla, onTrakt, dampad }: { m: TavlaMaskin; medLandar: boolean; oppen: boolean; onVaxla: () => void; onTrakt?: (v: TraktVal) => void; dampad?: boolean }) {
  const harTrakter = m.trakter.length > 0 || m.utanfor != null
  const rad = (
    <span style={{ ...rutnat(medLandar), minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...(dampad ? TYP.text : TYP.listtitel), color: dampad ? FARG.text2 : FARG.text }}>
          {!dampad && <RollPrick roll={m.roll} />}
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.namn}</span>
          {harTrakter && <Ikon namn={oppen ? 'expand_less' : 'expand_more'} storlek={IKON.text} farg={FARG.text3} />}
        </span>
        {m.stopp && <span style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.l }}>{m.stopp}</span>}
        {m.utanfor && <span style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.l }} data-utanfor={m.maskin_id}>{fmt(m.utanfor.volym)} utanför beställningen</span>}
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
          {m.utanfor && (
            <div data-utanfor-lista={m.maskin_id}>
              <div style={{ ...TYP.micro, color: FARG.text3, padding: `${AVSTAND.s}px 0 0 ${AVSTAND.l}px` }}>{m.roll === 'skordare' ? 'Skördat' : 'Skotat'} utanför beställningen</div>
              {m.utanfor.trakter.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: AVSTAND.xxl, paddingLeft: AVSTAND.l }}>
                  <span style={{ ...TYP.text, color: FARG.text3, minWidth: 0, overflowWrap: 'anywhere' }}>{u.namn}</span>
                  <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0 }}>{fmt(u.volym)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Stapeln mot beställt: ljust = gjort nu, mörkare = hinns före månadens slut, tomt = fattas. Går det över beställt står ett streck där beställt ligger. */
function Stapel({ nu, landar, bestallt }: { nu: number; landar: number | null; bestallt: number }) {
  const slut = Math.max(landar ?? nu, nu)
  const skala = Math.max(bestallt, slut, 1)
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / skala) * 100))}%`
  return (
    <div role="img" aria-label={`${fmt(nu)} gjort${landar != null ? `, prognos ${fmt(slut)}` : ''}, beställt ${fmt(bestallt)}`}
      style={{ position: 'relative', height: STAPEL_HOJD, borderRadius: STAPEL_HOJD / 2, background: FARG.upphojt, overflow: 'hidden' }} data-stapel="">
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(slut), background: FARG.text3 }} data-stapel-slut="" />
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(nu), background: FARG.text2 }} data-stapel-nu="" />
      {skala > bestallt && <span style={{ position: 'absolute', left: pct(bestallt), top: 0, bottom: 0, width: AVSTAND.xs / 2, background: FARG.text }} data-stapel-bestallt="" />}
    </div>
  )
}

function UtanRad({ u, onTrakt, inne }: { u: TavlaBlock['utan'][number]; onTrakt?: (v: TraktVal) => void; inne?: boolean }) {
  // Volymen står i ord efter namnet — aldrig i talkolumnerna: den är varken gjord eller på väg.
  const rad = (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, paddingLeft: inne ? AVSTAND.l : 0 }}>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ ...TYP.text, color: inne ? FARG.text2 : FARG.text, overflowWrap: 'anywhere' }}>{u.namn}</span>
        {!inne && <StatusOrd ton="orange" ord={`Ingen maskin · ${fmt(u.volym)} m³`} />}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0 }}>
        {inne && `${fmt(u.volym)} m³`}{onTrakt && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
      </span>
    </span>
  )
  return (
    <div style={{ borderTop: inne ? 'none' : LINJE }} data-utan={u.objekt_id}>
      {onTrakt ? <button type="button" onClick={() => onTrakt({ objekt_id: u.objekt_id, roll: u.roll })} style={KNAPP_RAD} aria-label={`${u.namn}, ingen maskin. Välj maskin`}>{rad}</button> : rad}
    </div>
  )
}

/** "Måste hålla 89 m³/dag · går 61" — orange när takten inte räcker; saknas takten sägs det. */
export function taktText(t: TavlaTakt): { ord: string; ton: 'orange' | 'gron' | 'dampad' } {
  const kravs = `Måste hålla ${fmt(Math.ceil(t.kravs))} m³/dag`
  if (t.nu == null) return { ord: `${kravs} · takt saknas`, ton: 'dampad' }
  const nu = `${t.ca ? 'går minst ' : 'går '}${fmt(Math.round(t.nu))}`
  return { ord: `${kravs} · ${nu}`, ton: t.hinner ? 'gron' : 'orange' }
}

function Block({ b, bestallt, medLandar, oppna, vaxla, onTrakt }: { b: TavlaBlock; bestallt: number; medLandar: boolean; oppna: Set<string>; vaxla: (id: string) => void; onTrakt?: (v: TraktVal) => void }) {
  const utanOppen = oppna.has(`${b.roll}:utan`)
  const radOppen = oppna.has(`${b.roll}:rad`)
  const utanSumma = b.utan.reduce((n, u) => n + Math.round(u.volym), 0)
  const harDetaljer = b.maskiner.length > 0 || b.markagare != null || b.utan.length > 0
  return (
    <div data-block={b.roll} style={{ paddingBottom: AVSTAND.m }}>
      {/* EN rad per roll: namn, dom i ord, stapel, och två tal. Allt annat bakom ett tryck. */}
      <button type="button" onClick={() => vaxla(`${b.roll}:rad`)} aria-expanded={radOppen} disabled={!harDetaljer && bestallt <= 0} data-rad-vaxla={b.roll} style={KNAPP_RAD}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min }} data-summa={b.roll}>
          <span style={{ ...TYP.listtitel, color: FARG.text }}>{b.rubrik}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
            <StatusOrd ton={b.ton} ord={b.ord} />
            {harDetaljer && <Ikon namn={radOppen ? 'expand_less' : 'chevron_right'} storlek={IKON.text} farg={FARG.text3} />}
          </span>
        </span>
        {bestallt > 0 && (
          <>
            <Stapel nu={b.nu} landar={b.landar} bestallt={bestallt} />
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, ...TYP.meta, ...TNUM, color: FARG.text2, padding: `${AVSTAND.xs}px 0 ${AVSTAND.s}px` }} data-stapeltext={b.roll}>
              <span>Gjort {fmt(b.nu)}</span>
              <span>{b.landar != null ? `Prognos ${fmt(b.landar)}` : fmt(b.nu)} av {fmt(bestallt)}</span>
            </span>
            {b.takt && (
              <span style={{ display: 'block', padding: `0 0 ${AVSTAND.s}px` }} data-takt={b.roll}>
                <StatusOrd ton={taktText(b.takt).ton} ord={taktText(b.takt).ord} />
              </span>
            )}
          </>
        )}
      </button>
      {radOppen && (
        <div data-detaljer={b.roll}>
          {medLandar && (
            <div style={{ ...rutnat(true), alignItems: 'end', ...TYP.micro, color: FARG.text3, paddingTop: AVSTAND.s }}>
              <span />
              <span style={HOGER}>Gjort</span>
              <span style={HOGER}>Prognos</span>
            </div>
          )}
          {b.maskiner.map(m => <MaskinRad key={m.maskin_id} m={m} medLandar={medLandar} oppen={oppna.has(`${b.roll}:${m.maskin_id}`)} onVaxla={() => vaxla(`${b.roll}:${m.maskin_id}`)} onTrakt={onTrakt} />)}
          {b.markagare && <MaskinRad m={{ maskin_id: 'markagare', namn: 'Egen skotning', roll: 'skotare', nu: b.markagare.nu, landar: b.markagare.landar, ca: false, stopp: null, trakter: b.markagare.trakter, utanfor: null }}
            dampad medLandar={medLandar} oppen={oppna.has(`${b.roll}:markagare`)} onVaxla={() => vaxla(`${b.roll}:markagare`)} onTrakt={onTrakt} />}
          {b.utan.length === 1 && <UtanRad u={b.utan[0]} onTrakt={onTrakt} />}
          {b.utan.length > 1 && (
            <div style={{ borderTop: LINJE }} data-utan-grupp={b.roll}>
              <button type="button" onClick={() => vaxla(`${b.roll}:utan`)} aria-expanded={utanOppen} style={KNAPP_RAD}>
                <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
                  <StatusOrd ton="orange" ord={`${b.utan.length} trakter utan maskin · ${fmt(utanSumma)} m³`} />
                  <Ikon namn={utanOppen ? 'expand_less' : 'expand_more'} storlek={IKON.text} farg={FARG.text3} />
                </span>
              </button>
              {utanOppen && <div style={{ paddingBottom: AVSTAND.s }}>{b.utan.map(u => <UtanRad key={u.objekt_id} u={u} onTrakt={onTrakt} inne />)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SparKort({ s, oppna, vaxla, onTrakt }: { s: TavlaSpar; oppna: Set<string>; vaxla: (id: string) => void; onTrakt?: (v: TraktVal) => void }) {
  const medLandar = s.block.some(b => b.landar != null)
  return (
    <Sektion rubrik={s.bestallt > 0 ? `${s.namn} · beställt ${fmt(s.bestallt)}` : s.namn}>
      <div data-spar={s.typ}>
        <Block b={s.block[0]} bestallt={s.bestallt} medLandar={medLandar} oppna={oppna} vaxla={id => vaxla(`${s.typ}:${id}`)} onTrakt={onTrakt} />
        <Block b={s.block[1]} bestallt={s.bestallt} medLandar={medLandar} oppna={oppna} vaxla={id => vaxla(`${s.typ}:${id}`)} onTrakt={onTrakt} />
      </div>
    </Sektion>
  )
}

/** Virket som ligger kvar i skogen (ingående oskotat + skördat − skotat) — eget kort, så det inte läses som det som fattas mot beställningen. */
function KvarKort({ spar }: { spar: TavlaSpar[] }) {
  return (
    <Sektion rubrik="Kvar att skota i skogen">
      {spar.map((s, i) => (
        <div key={s.typ} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, borderTop: i > 0 ? LINJE : 'none', ...TYP.text, color: FARG.text }} data-kvar={s.typ}>
          <span>{s.namn}</span>
          <span style={TNUM}>{fmt(s.kvarISkogen)}</span>
        </div>
      ))}
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


/** "Vad kan du göra?" — bara det som finns. Trakter utan maskin öppnas på plats, och ett tryck på en trakt väljer maskin. */
function GorKort({ gor, onTrakt }: { gor: TavlaGor[]; onTrakt?: (v: TraktVal) => void }) {
  const [oppen, setOppen] = useState<number | null>(null)
  return (
    <Sektion rubrik="Vad kan du göra?">
      <div data-gor="">
        {gor.map((g, i) => {
          const rad = (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px 0` }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ ...TYP.listtitel, color: FARG.text }}>{g.text}</span>
                <span style={{ ...TYP.meta, color: g.slag === 'formycket' ? FARG.text2 : FARG.orange }}>{g.under}</span>
              </span>
              {g.slag === 'utan' && <Ikon namn={oppen === i ? 'expand_less' : 'chevron_right'} storlek={IKON.text} farg={FARG.text3} />}
            </span>
          )
          return (
            <div key={`${g.slag}:${i}`} style={{ borderTop: i > 0 ? LINJE : 'none' }} data-gor-rad={g.slag}>
              {g.slag === 'utan'
                ? <button type="button" onClick={() => setOppen(oppen === i ? null : i)} aria-expanded={oppen === i} style={KNAPP_RAD}>{rad}</button>
                : rad}
              {g.slag === 'utan' && oppen === i && <div style={{ paddingBottom: AVSTAND.s }}>{g.trakter.map(u => <UtanRad key={u.objekt_id} u={u} onTrakt={onTrakt} inne />)}</div>}
            </div>
          )
        })}
      </div>
    </Sektion>
  )
}

/** "Räcker trakterna?" — finns det skog nog kvar i inlagda trakter för beställningen? Skild från "hinner maskinen". Skördarens rad öppnar vilka trakter som behövs. */
function RackerKort({ spar, onBehov, onSkot }: { spar: TavlaSpar[]; onBehov?: (typ: TavlaSpar['typ']) => void; onSkot?: (typ: TavlaSpar['typ']) => void }) {
  const rader = spar.flatMap(s => s.racker.map(r => ({ spar: s, r })))
  if (rader.length === 0) return null
  return (
    <Sektion rubrik="Räcker trakterna?" not="Skog som finns kvar i inlagda trakter, mot det som behövs för beställningen. Alla tal är m³.">
      <div data-racker="">
        {rader.map(({ spar: s, r }, i) => {
          const kan = r.roll === 'skordare' ? onBehov != null && r.behov != null : onSkot != null && r.skot != null
          const inne = (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0` }}>
              <span style={{ ...TYP.text, color: FARG.text, whiteSpace: 'nowrap' }}>{r.rubrik} · {s.namn.toLowerCase()}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
                <StatusOrd ton={r.ton} ord={r.ord} />
                {kan && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
              </span>
            </span>
          )
          return (
            <div key={`${s.typ}:${r.roll}`} style={{ borderTop: i > 0 ? LINJE : 'none' }} data-racker-rad={`${s.typ}:${r.roll}`}>
              {kan ? <button type="button" onClick={() => (r.roll === 'skordare' ? onBehov! : onSkot!)(s.typ)} style={KNAPP_RAD} aria-label={`${s.namn}, ${r.rubrik.toLowerCase()}: ${r.ord}. Visa trakterna`}>{inne}</button> : inne}
            </div>
          )
        })}
      </div>
    </Sektion>
  )
}

/** Resten: GROT och övrigt samt det som ligger kvar i skogen, bakom en rad. */
function MerKort({ tavla, onTrakt }: { tavla: TavlaVy; onTrakt?: (v: TraktVal) => void }) {
  const [oppen, setOppen] = useState(false)
  if (tavla.ovrigt.length === 0 && tavla.spar.length === 0) return null
  return (
    <div data-mer="">
      <button type="button" onClick={() => setOppen(o => !o)} aria-expanded={oppen} style={{ ...KNAPP_RAD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: TRAFFYTA.primar, ...TYP.text, color: FARG.text2 }}>
        <span>{oppen ? 'Dölj' : 'GROT och kvar i skogen'}</span>
        <Ikon namn={oppen ? 'expand_less' : 'chevron_right'} storlek={IKON.text} farg={FARG.text3} />
      </button>
      {oppen && (
        <>
          {tavla.ovrigt.length > 0 && <OvrigtKort rader={tavla.ovrigt} onTrakt={onTrakt} />}
          {tavla.spar.length > 0 && <KvarKort spar={tavla.spar} />}
        </>
      )}
    </div>
  )
}

/** Korten i tavlan: ett per spår, och "GROT och övrigt" när en maskin bara har sådant. */
export default function Tavla({ tavla, onTrakt, onBehov, onSkot }: { tavla: TavlaVy; onTrakt?: (v: TraktVal) => void; onBehov?: (typ: TavlaSpar['typ']) => void; onSkot?: (typ: TavlaSpar['typ']) => void }) {
  const [oppna, setOppna] = useState<Set<string>>(() => new Set())
  const vaxla = (id: string) => setOppna(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n })
  // Nyckeln bär spåret, så samma maskin kan stå öppen i ett spår och stängd i ett annat.
  const forSpar = (typ: string) => new Set([...oppna].filter(k => k.startsWith(`${typ}:`)).map(k => k.slice(typ.length + 1)))
  return (
    <>
      {tavla.gor.length > 0 && <GorKort gor={tavla.gor} onTrakt={onTrakt} />}
      <RackerKort spar={tavla.spar} onBehov={onBehov} onSkot={onSkot} />
      {tavla.spar.map(s => <SparKort key={s.typ} s={s} oppna={forSpar(s.typ)} vaxla={vaxla} onTrakt={onTrakt} />)}
      <MerKort tavla={tavla} onTrakt={onTrakt} />
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

/** "Gallring behöver 713 m³ till": trakterna som behövs, och de som kan vänta. Admin väljer vilka som flyttas till nästa månad. */
export function BehovSheet({ open, onClose, namn, behov, takt, nastaNamn, manadNamn, kanFlytta, onFlytta }: {
  open: boolean; onClose: () => void; namn: string; behov: TavlaBehov; takt?: TavlaTakt | null; nastaNamn: string; manadNamn: string; kanFlytta: boolean
  onFlytta: (objektIds: string[]) => Promise<string | null>
}) {
  const flyttbara = behov.inte.filter(t => t.flyttbar)
  const [valda, setValda] = useState<Set<string>>(() => new Set(flyttbara.map(t => t.objekt_id)))
  const [lage, setLage] = useState<{ skickar: boolean; fel: string | null }>({ skickar: false, fel: null })
  if (!open) return null
  const vaxla = (id: string) => setValda(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const antal = valda.size
  const volym = flyttbara.filter(t => valda.has(t.objekt_id)).reduce((a, t) => a + t.kvar, 0)
  async function flytta() {
    setLage({ skickar: true, fel: null })
    const fel = await onFlytta([...valda])
    if (fel) setLage({ skickar: false, fel })
    else { setLage({ skickar: false, fel: null }); onClose() }
  }
  const rubrik = behov.behov > 0 ? `${namn} behöver ${fmt(behov.behov)} m³ till` : `${namn} är klar med beställningen`
  const under = behov.saknas > 0 ? 'Trakterna räcker inte.' : behov.inte.length > 0 ? 'Det är för mycket inlagt.' : 'Trakterna räcker.'
  return (
    <Sheet open onClose={onClose} title={rubrik}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }} data-behov-under="">Beställt {fmt(behov.bestallt)} · gjort {fmt(behov.nu)}. {under}</p>
      {takt && (
        <Sektion rubrik="Takten" not={takt.hinner === false && takt.fattasDagar != null ? `Hålls takten fattas ca ${Math.max(1, Math.round(takt.fattasDagar))} arbetsdagar. ${takt.dagarKvar} arbetsdagar kvar i månaden.` : `${takt.dagarKvar} arbetsdagar kvar i månaden.`}>
          <div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }} data-takt-ark="">
            <StatusOrd ton={taktText(takt).ton} ord={taktText(takt).ord} />
          </div>
        </Sektion>
      )}
      {behov.behovs.length > 0 && (
        <Sektion rubrik="De här behövs" not={behov.dagarBehovs != null ? `Allt som behövs tar ${dagarText(behov.dagarBehovs)}.` : undefined}>
          <div data-behovs="">
            {behov.behovs.map((t, i) => (
              <div key={t.objekt_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0`, borderTop: i > 0 ? LINJE : 'none' }} data-behovs-rad={t.objekt_id}>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{t.namn}</span>
                  {t.behovs < t.kvar && <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>Tar resten av behovet · {fmt(t.behovs)} av {fmt(t.kvar)} kvar</span>}
                  <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }} data-tid="">
                    {t.dagar == null ? 'Tid saknas · ingen prognos' : `${dagarText(t.dagar)}${t.till && t.behovs >= t.kvar ? ` · klar ${t.till}` : ''}`}
                  </span>
                </span>
                <span style={{ ...TYP.text, ...TNUM, color: FARG.text, fontWeight: VIKT.fet }}>{fmt(t.behovs)}</span>
              </div>
            ))}
            {behov.saknas > 0 && (
              <div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center', borderTop: LINJE }} data-behov-saknas="">
                <StatusOrd ton="orange" ord={`Det saknas ca ${fmt(behov.saknas)} m³ · lägg in en ny trakt`} />
              </div>
            )}
          </div>
        </Sektion>
      )}
      {behov.behovs.length === 0 && behov.saknas > 0 && (
        <Sektion rubrik="De här behövs"><div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }} data-behov-saknas=""><StatusOrd ton="orange" ord={`Det saknas ca ${fmt(behov.saknas)} m³ · lägg in en ny trakt`} /></div></Sektion>
      )}
      {behov.inte.length > 0 && (
        <Sektion rubrik={`Behövs inte i ${manadNamn}`} not={kanFlytta && flyttbara.length > 0 ? `Välj vilka som ska flyttas till ${nastaNamn}. De som redan är påbörjade går inte att flytta här.` : undefined}>
          <div data-inte="">
            {behov.inte.map((t, i) => {
              const pa = valda.has(t.objekt_id)
              const rad = (
                <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0` }}>
                  {kanFlytta && t.flyttbar && (
                    <span aria-hidden="true" style={{ width: AVSTAND.l + AVSTAND.xs, height: AVSTAND.l + AVSTAND.xs, borderRadius: '50%', boxSizing: 'border-box', border: `2px solid ${pa ? FARG.text : FARG.text3}`, background: pa ? FARG.text : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {pa && <Ikon namn="check" storlek={IKON.text} farg={FARG.bg} />}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ ...TYP.text, color: FARG.text2, overflowWrap: 'anywhere' }}>{t.namn}</span>
                    <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3 }} data-tid="">{t.dagar == null ? 'Tid saknas · ingen prognos' : dagarText(t.dagar)}</span>
                  </span>
                  <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, flexShrink: 0 }}>{fmt(t.kvar)}</span>
                </span>
              )
              return (
                <div key={t.objekt_id} style={{ borderTop: i > 0 ? LINJE : 'none' }} data-inte-rad={t.objekt_id}>
                  {kanFlytta && t.flyttbar
                    ? <button type="button" role="checkbox" aria-checked={pa} onClick={() => vaxla(t.objekt_id)} style={KNAPP_RAD}>{rad}</button>
                    : rad}
                </div>
              )
            })}
          </div>
        </Sektion>
      )}
      {kanFlytta && flyttbara.length > 0 && (
        <>
          <button type="button" onClick={flytta} disabled={antal === 0 || lage.skickar} aria-busy={lage.skickar} style={{ ...KNAPP.primar, ...(antal === 0 || lage.skickar ? INAKTIV : null) }} data-flytta-manad="">
            {lage.skickar ? 'Flyttar…' : antal === 0 ? `Välj trakter att flytta` : antal === 1 ? `Flytta 1 trakt till ${nastaNamn} · ${fmt(volym)} m³` : `Flytta ${antal} trakter till ${nastaNamn} · ${fmt(volym)} m³`}
          </button>
          {lage.fel && <p role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{lage.fel}</p>}
        </>
      )}
    </Sheet>
  )
}


/** Skotarens ark: vilka trakter som ska skotas, hur mycket som är kvar på var och en, vem som tar den och hur lång tid. Trakter utan skotare överst — där kan du välja maskin. */
export function SkotSheet({ onClose, namn, skot, takt, onTrakt }: { onClose: () => void; namn: string; skot: TavlaSkot; takt?: TavlaTakt | null; onTrakt?: (v: TraktVal) => void }) {
  const utan = skot.rader.filter(r => r.maskin == null)
  const med = skot.rader.filter(r => r.maskin != null)
  const under = skot.saknas > 0 ? 'Trakterna räcker inte.' : 'Trakterna räcker.'
  const rad = (t: TavlaSkot['rader'][number], i: number, valbar: boolean) => {
    const inne = (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0` }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ ...TYP.text, color: FARG.text, overflowWrap: 'anywhere' }}>{t.namn}</span>
          <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }} data-tid="">
            {t.maskin ?? 'Ingen skotare'} · {t.dagar == null ? 'tid saknas' : dagarText(t.dagar)}{t.till ? ` · klar ${t.till}` : ''}
          </span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.text, ...TNUM, color: FARG.text, fontWeight: VIKT.fet }}>{fmt(t.kvar)}</span>
          {valbar && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
        </span>
      </span>
    )
    return (
      <div key={t.objekt_id} style={{ borderTop: i > 0 ? LINJE : 'none' }} data-skot-rad={t.objekt_id}>
        {valbar ? <button type="button" onClick={() => onTrakt!({ objekt_id: t.objekt_id, roll: 'skotare' })} style={KNAPP_RAD}>{inne}</button> : inne}
      </div>
    )
  }
  return (
    <Sheet open onClose={onClose} title={skot.behov > 0 ? `${namn} · skotaren behöver ${fmt(skot.behov)} m³ till` : `${namn} · skotaren är klar med beställningen`}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }} data-skot-under="">Beställt {fmt(skot.bestallt)} · skotat {fmt(skot.nu)}. {skot.behov > 0 ? under : ''}</p>
      {takt && (
        <Sektion rubrik="Takten" not={takt.hinner === false && takt.fattasDagar != null ? `Hålls takten fattas ca ${Math.max(1, Math.round(takt.fattasDagar))} arbetsdagar. ${takt.dagarKvar} arbetsdagar kvar i månaden.` : `${takt.dagarKvar} arbetsdagar kvar i månaden.`}>
          <div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }} data-takt-ark="">
            <StatusOrd ton={taktText(takt).ton} ord={taktText(takt).ord} />
          </div>
        </Sektion>
      )}
      {utan.length > 0 && <Sektion rubrik="Saknar skotare" not={onTrakt ? 'Tryck på en trakt för att välja skotare.' : undefined}><div data-skot-utan="">{utan.map((t, i) => rad(t, i, onTrakt != null))}</div></Sektion>}
      {med.length > 0 && <Sektion rubrik="Har skotare"><div data-skot-med="">{med.map((t, i) => rad(t, i, false))}</div></Sektion>}
      {skot.saknas > 0 && <Sektion rubrik="Saknas"><div style={{ minHeight: TRAFFYTA.min, display: 'flex', alignItems: 'center' }} data-skot-saknas=""><StatusOrd ton="orange" ord={`Det saknas ca ${fmt(skot.saknas)} m³ · lägg in en ny trakt`} /></div></Sektion>}
    </Sheet>
  )
}
