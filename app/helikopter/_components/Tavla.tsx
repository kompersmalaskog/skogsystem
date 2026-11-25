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
import Flikkontroll from '@/components/design/Flikkontroll'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import { fmt } from '../_lib/format'
import type { KlarRoll } from '../_lib/klar'
import { EGEN_SKOTNING, dagarText, flyttaPlats } from '../_lib/tavla'
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
          {b.markagare && <MaskinRad m={{ maskin_id: 'markagare', namn: 'Egen skotning', roll: 'skotare', nu: b.markagare.nu, landar: b.markagare.landar, ca: false, korAnnat: false, stopp: null, trakter: b.markagare.trakter, utanfor: null }}
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

/** "Räcker trakterna?" — finns det skog nog kvar i inlagda trakter för beställningen? Skild från "hinner maskinen". Raden öppnar Planera (trakterna bor där, inte här). */
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

/** Ändra ordningen: en förhandsvisning som sparas först när du trycker Spara. */
export type OrdningsStyrning = {
  /** Trakterna i ny ordning (objekt_id) — de tar över varandras platser. */
  onOrdning: (ids: string[]) => void
  andrad: boolean
  onSpara: () => Promise<string | null>
  onAngra: () => void
}

/** En rad per trakt: nummer, namn och maskin (tryck = byt maskin), siffran, pilar. */
function OrdnadTraktRad({ nr, namn, under, maskin, ingen, ton, tal, kryss, onMaskin, upp, ner, id }: {
  nr: number; namn: string; under: string[]; maskin: string | null; ingen: string; ton: 'full' | 'dampad'; tal: number
  kryss?: { pa: boolean; onToggle: () => void } | null
  onMaskin?: () => void
  upp?: (() => void) | null; ner?: (() => void) | null
  id: string
}) {
  const text = ton === 'full' ? FARG.text : FARG.text2
  const maskinText = `${maskin ?? ingen}${onMaskin ? ' ›' : ''}`
  const namnBlock = (
    <span style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.s, minWidth: 0 }}>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3, minWidth: AVSTAND.l, paddingTop: AVSTAND.xs / 2 }} data-nr="">{nr}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ ...TYP.text, color: text, overflowWrap: 'anywhere' }}>{namn}</span>
        {under.map((u, k) => <span key={k} style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }} data-tid="">{u}</span>)}
        <span style={{ ...TYP.meta, ...TNUM, color: maskin ? FARG.text2 : FARG.orange }} data-maskin-rad="">{maskinText}</span>
      </span>
    </span>
  )
  const pil = (namnIkon: string, etikett: string, on: (() => void) | null | undefined) => (
    <button type="button" aria-label={`${etikett}: ${namn}`} onClick={on ?? undefined} disabled={!on} style={{ ...KNAPP_RAD, width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.25, flexShrink: 0 }} data-pil={namnIkon}>
      <Ikon namn={namnIkon} storlek={IKON.rad} farg={FARG.text2} />
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, padding: `${AVSTAND.xs}px 0` }} data-trakt-rad={id}>
      {kryss && (
        <button type="button" role="checkbox" aria-checked={kryss.pa} aria-label={`Flytta ${namn}`} onClick={kryss.onToggle} style={{ ...KNAPP_RAD, width: TRAFFYTA.min, height: TRAFFYTA.min, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span aria-hidden="true" style={{ width: AVSTAND.l + AVSTAND.xs, height: AVSTAND.l + AVSTAND.xs, borderRadius: '50%', boxSizing: 'border-box', border: `2px solid ${kryss.pa ? FARG.text : FARG.text3}`, background: kryss.pa ? FARG.text : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {kryss.pa && <Ikon namn="check" storlek={IKON.text} farg={FARG.bg} />}
          </span>
        </button>
      )}
      {onMaskin
        ? <button type="button" onClick={onMaskin} style={{ ...KNAPP_RAD, flex: 1, minWidth: 0, minHeight: TRAFFYTA.min }} aria-label={`${namn}: byt maskin`}>{namnBlock}</button>
        : <div style={{ flex: 1, minWidth: 0 }}>{namnBlock}</div>}
      <span style={{ ...TYP.text, ...TNUM, color: text, fontWeight: ton === 'full' ? VIKT.fet : undefined, flexShrink: 0 }}>{fmt(tal)}</span>
      {(upp !== undefined || ner !== undefined) && <span style={{ display: 'flex', flexShrink: 0 }}>{pil('keyboard_arrow_up', 'Flytta upp', upp)}{pil('keyboard_arrow_down', 'Flytta ned', ner)}</span>}
    </div>
  )
}

/** "Ordningen är ändrad · Spara ordning": EN primär knapp, Ångra som tertiär. Raderna ovan visar redan den nya ordningen. */
function OrdningsBar({ st, primar }: { st: OrdningsStyrning; primar: boolean }) {
  const [lage, setLage] = useState<{ skickar: boolean; fel: string | null }>({ skickar: false, fel: null })
  if (!st.andrad) return null
  async function spara() {
    setLage({ skickar: true, fel: null })
    const fel = await st.onSpara()
    setLage({ skickar: false, fel })
  }
  return (
    <div style={{ margin: `0 0 ${AVSTAND.l}px` }} data-ordning-bar="">
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px` }}>Ordningen är ändrad. Tider och vilka trakter som behövs är räknade på den nya.</p>
      <button type="button" onClick={spara} disabled={lage.skickar} aria-busy={lage.skickar} style={{ ...(primar ? KNAPP.primar : KNAPP.sekundar), ...(lage.skickar ? INAKTIV : null) }} data-spara-ordning="">{lage.skickar ? 'Sparar…' : 'Spara ordning'}</button>
      <button type="button" onClick={st.onAngra} style={{ ...KNAPP.tertiar, width: '100%' }} data-angra-ordning="">Ångra</button>
      {lage.fel && <p role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.s }}>{lage.fel}</p>}
    </div>
  )
}

/** Pilarna för en rad i gruppen: flytta upp/ned bland dem som går att flytta. Förra månadens står kvar. */
function pilar(grupp: string[], id: string, st?: OrdningsStyrning) {
  if (!st) return {}
  const k = grupp.indexOf(id)
  if (k < 0) return { upp: null, ner: null }
  return { upp: k > 0 ? () => st.onOrdning(flyttaPlats(grupp, k, -1)) : null, ner: k < grupp.length - 1 ? () => st.onOrdning(flyttaPlats(grupp, k, 1)) : null }
}

/** Planera: en hel sida för ett spår, byggd som Arbetsrapporten — svaret först, en lista, en rad är en sak.
 *  Skördare | Skotare är en växel (samma trakter, två vinklar). Listan står i den ordning trakterna körs;
 *  rubriken "Behövs inte i <månad>" är linjen där beställningen är full. Pilarna ändrar ordning, tryck på maskinen byter den. */
export type PlaneraRoll = 'skordare' | 'skotare'
type PlaneraTrakt = { objekt_id: string; namn: string; maskin: string | null; kvar: number; behovs: number; dagar: number | null; till: string | null; flyttbar: boolean; fast: boolean }

export function PlaneraSida({ spar, start, manadNamn, nastaNamn, kanFlytta, onFlytta, ordning, onTrakt, onKlart, visaNamn = true }: {
  spar: TavlaSpar; start: PlaneraRoll; visaNamn?: boolean; manadNamn: string; nastaNamn: string; kanFlytta: boolean
  onFlytta: (objektIds: string[]) => Promise<string | null>
  ordning?: OrdningsStyrning; onTrakt?: (v: TraktVal) => void; onKlart?: () => void
}) {
  const [roll, setRoll] = useState<PlaneraRoll>(start)
  // Avmarkerade, inte markerade: när ordningen ändras och en annan trakt hamnar under "Behövs inte" är den förvald.
  const [bort, setBort] = useState<Set<string>>(() => new Set())
  const [lage, setLage] = useState<{ skickar: boolean; fel: string | null }>({ skickar: false, fel: null })
  const behov = spar.racker.find(r => r.roll === 'skordare')?.behov ?? null
  const skot = spar.racker.find(r => r.roll === 'skotare')?.skot ?? null
  const takt = spar.block[roll === 'skordare' ? 0 : 1].takt
  const ingen = roll === 'skordare' ? 'Ingen skördare' : 'Ingen skotare'

  // Tre grupper i samma form: körs (behövs), saknar maskin (bara skotare) och behövs inte.
  const tillTrakt = (t: TavlaBehov['behovs'][number] | TavlaSkot['rader'][number], flyttbar: boolean): PlaneraTrakt => ({ objekt_id: t.objekt_id, namn: t.namn, maskin: t.maskin, kvar: t.kvar, behovs: t.behovs, dagar: t.dagar, till: t.till, fast: t.fast, flyttbar })
  const grupper: { koors: PlaneraTrakt[]; utan: PlaneraTrakt[]; inte: PlaneraTrakt[] } = roll === 'skordare'
    ? { koors: (behov?.behovs ?? []).map(t => tillTrakt(t, false)), utan: [], inte: (behov?.inte ?? []).map(t => tillTrakt(t, t.flyttbar)) }
    : { koors: (skot?.rader ?? []).filter(t => t.maskin != null && t.behovs > 0).map(t => tillTrakt(t, false)), utan: (skot?.rader ?? []).filter(t => t.maskin == null).map(t => tillTrakt(t, false)), inte: (skot?.rader ?? []).filter(t => t.maskin != null && t.behovs <= 0).map(t => tillTrakt(t, false)) }
  const ordnade = [...grupper.koors, ...grupper.inte]
  const nr = new Map<string, number>([...ordnade.map((t, i) => [t.objekt_id, i + 1] as const), ...grupper.utan.map((t, i) => [t.objekt_id, i + 1] as const)])
  const pilGrupp = (utanMaskin: boolean) => (utanMaskin ? grupper.utan : ordnade).filter(t => !t.fast).map(t => t.objekt_id)

  const utanSumma = skot?.utanSumma ?? 0
  const gjort = roll === 'skordare' ? behov : skot
  const rubrik = !gjort ? '' : roll === 'skordare'
    ? (gjort.behov > 0 ? `Skördaren behöver ${fmt(gjort.behov)} m³ till` : 'Skördaren är klar med beställningen')
    : (gjort.behov > 0 ? `Skotaren behöver ${fmt(gjort.behov)} m³ till` : 'Skotaren är klar med beställningen')
  const saknas = gjort?.saknas ?? 0
  const svar = !gjort ? null
    : saknas > 0 ? { ton: 'orange' as const, ord: roll === 'skotare' && utanSumma >= saknas ? `Det saknas ca ${fmt(saknas)} m³ · välj skotare nedan` : `Det saknas ca ${fmt(saknas)} m³ · lägg in en ny trakt` }
    : roll === 'skordare' && grupper.inte.length > 0 ? { ton: 'dampad' as const, ord: 'Det är för mycket inlagt' }
    : { ton: 'gron' as const, ord: roll === 'skordare' ? 'Trakterna räcker' : 'Trakterna med skotare räcker' }

  const flyttbara = grupper.inte.filter(t => t.flyttbar)
  const valda = new Set(flyttbara.filter(t => !bort.has(t.objekt_id)).map(t => t.objekt_id))
  const vaxla = (id: string) => setBort(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const volym = flyttbara.filter(t => valda.has(t.objekt_id)).reduce((a, t) => a + t.kvar, 0)
  async function flytta() {
    setLage({ skickar: true, fel: null })
    const fel = await onFlytta([...valda])
    if (fel) setLage({ skickar: false, fel })
    else { setLage({ skickar: false, fel: null }); onKlart?.() }
  }

  const rad = (t: PlaneraTrakt, i: number, typ: 'koors' | 'utan' | 'inte', attr: string) => {
    const delvis = typ === 'koors' && t.behovs < t.kvar
    const tid = t.dagar == null ? 'Tid saknas' : dagarText(delvis ? t.dagar * (t.behovs / t.kvar) : t.dagar)
    return (
      <div key={t.objekt_id} style={{ borderTop: i > 0 ? LINJE : 'none' }} {...{ [attr]: t.objekt_id }}>
        <OrdnadTraktRad id={t.objekt_id} nr={nr.get(t.objekt_id) ?? i + 1} namn={t.namn} maskin={t.maskin} ingen={ingen} ton={typ === 'inte' ? 'dampad' : 'full'}
          tal={typ === 'koors' ? t.behovs : t.kvar}
          onMaskin={onTrakt ? () => onTrakt({ objekt_id: t.objekt_id, roll }) : undefined}
          under={[...(delvis ? [`Behövs ${fmt(t.behovs)} av ${fmt(t.kvar)} m³`] : []), ...(typ === 'utan' ? [] : [tid + (typ === 'koors' && !delvis && t.till ? ` · klar ${t.till}` : '')])]}
          kryss={roll === 'skordare' && typ === 'inte' && kanFlytta && t.flyttbar ? { pa: valda.has(t.objekt_id), onToggle: () => vaxla(t.objekt_id) } : null}
          {...pilar(pilGrupp(typ === 'utan'), t.objekt_id, ordning)} />
      </div>
    )
  }

  return (
    <div data-planera={spar.typ}>
      {visaNamn && <h2 style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.titel, color: FARG.text }}>{spar.namn}</h2>}
      <div style={{ marginBottom: AVSTAND.l }}>
        <Flikkontroll flikar={[['skordare', 'Skördare'], ['skotare', 'Skotare']] as const} aktiv={roll} onVal={setRoll} />
      </div>

      {/* Svaret först: vad som behövs, om det räcker, och om takten hålls. Tre korta rader. */}
      <div style={{ marginBottom: AVSTAND.l }} data-planera-svar={roll}>
        <h2 style={{ margin: `0 0 ${AVSTAND.xs}px`, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
        {svar && <div style={{ minHeight: AVSTAND.xl }} data-behov-under=""><StatusOrd bryt ton={svar.ton} ord={svar.ord} /></div>}
        {takt && <div style={{ minHeight: AVSTAND.xl }} data-takt-ark=""><StatusOrd ton={taktText(takt).ton} ord={taktText(takt).ord} /></div>}
      </div>

      {ordning && <OrdningsBar st={ordning} primar />}

      {grupper.koors.length > 0 && (
        <Sektion rubrik="Körs i den här ordningen">
          <div data-behovs="" data-skot-behovs="">{grupper.koors.map((t, i) => rad(t, i, 'koors', roll === 'skordare' ? 'data-behovs-rad' : 'data-skot-rad'))}</div>
        </Sektion>
      )}
      {grupper.utan.length > 0 && (
        <Sektion rubrik="Ingen skotare — skotas inte" not="Tryck på en trakt och välj skotare.">
          <div data-skot-utan="">{grupper.utan.map((t, i) => rad(t, i, 'utan', 'data-skot-rad'))}</div>
        </Sektion>
      )}
      {grupper.inte.length > 0 && (
        <Sektion rubrik={`Behövs inte i ${manadNamn}`}>
          <div data-inte="" data-skot-inte="">{grupper.inte.map((t, i) => rad(t, i, 'inte', roll === 'skordare' ? 'data-inte-rad' : 'data-skot-rad'))}</div>
        </Sektion>
      )}
      {roll === 'skordare' && kanFlytta && flyttbara.length > 0 && (
        <>
          <button type="button" onClick={flytta} disabled={valda.size === 0 || lage.skickar} aria-busy={lage.skickar} style={{ ...(ordning?.andrad ? KNAPP.sekundar : KNAPP.primar), ...(valda.size === 0 || lage.skickar ? INAKTIV : null) }} data-flytta-manad="">
            {lage.skickar ? 'Flyttar…' : valda.size === 0 ? 'Välj trakter att flytta' : valda.size === 1 ? `Flytta 1 trakt till ${nastaNamn} · ${fmt(volym)} m³` : `Flytta ${valda.size} trakter till ${nastaNamn} · ${fmt(volym)} m³`}
          </button>
          {lage.fel && <p role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{lage.fel}</p>}
        </>
      )}
    </div>
  )
}

/** Planera-sidan i menyn: spåret väljs här (en växel när det finns två), sedan Skördare | Skotare och listan. */
export function PlaneraFlik({ tavla, typ, onTyp, start, ...rest }: {
  tavla: TavlaVy; typ: TavlaSpar['typ'] | null; onTyp: (t: TavlaSpar['typ']) => void; start: PlaneraRoll
  manadNamn: string; nastaNamn: string; kanFlytta: boolean; onFlytta: (objektIds: string[]) => Promise<string | null>
  ordning?: OrdningsStyrning; onTrakt?: (v: TraktVal) => void; onKlart?: () => void
}) {
  const spar = tavla.spar.find(s => s.typ === typ) ?? tavla.spar[0]
  if (!spar) return null
  return (
    <>
      {tavla.spar.length > 1 && (
        <div style={{ marginBottom: AVSTAND.l }} data-planera-spar="">
          <Flikkontroll flikar={tavla.spar.map(s => [s.typ, s.namn] as const)} aktiv={spar.typ} onVal={onTyp} />
        </div>
      )}
      <PlaneraSida key={`${spar.typ}:${start}`} spar={spar} start={start} visaNamn={tavla.spar.length === 1} {...rest} />
    </>
  )
}
