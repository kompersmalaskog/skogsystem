'use client'

// PROGNOS (2026-11-20, Martin: "hur det ska gå på varje trakt och maskin så vi vet om vi hinner").
// Överst fyra svar (spår × skördare/skotare): ett ord med talet. Under: Per trakt (hinns · hinns delvis · hinns inte, med månadens slut som en linje)
// eller Per maskin (vad var och en hinner). Prognos läser bara — ett tryck på en rad går till Planera, där ändringarna görs.
import { useState } from 'react'
import Sektion from '@/components/design/Sektion'
import Ikon from '@/components/design/Ikon'
import Flikkontroll from '@/components/design/Flikkontroll'
import { AVSTAND, FARG, IKON, KOLUMN, KORT, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { fmt } from '../_lib/format'
import type { Forslag, Prognos as PrognosData, PrognosMaskin, PrognosRoll, PrognosSpar, PrognosTrakt } from '../_lib/prognos'
import type { Typ } from '../_lib/queries'
import type { PlaneraRoll } from './Tavla'

type Vy = 'trakt' | 'maskin'
const VYER = [['trakt', 'Per trakt'], ['maskin', 'Per maskin']] as const
const tonFarg = (t: PrognosRoll['ton']) => (t === 'orange' ? FARG.orange : t === 'gron' ? FARG.gron : FARG.text2)
const dec = (n: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const planeraRoll = (r: PrognosRoll['roll'] | PrognosMaskin['roll']): PlaneraRoll => (r === 'skordare' ? 'skordare' : 'skotare')

function statusText(t: PrognosTrakt): { text: string; orange: boolean } {
  if (t.status === 'ingen_maskin') return { text: 'Ingen maskin', orange: true }
  if (t.status === 'hinns_inte') return { text: t.korAnnat ? 'Hinns inte · maskinen kör annat' : 'Hinns inte', orange: true }
  if (t.status === 'delvis') return { text: `Hinns delvis · ${fmt(t.hinner)} av ${fmt(t.kvar)}`, orange: true }
  return { text: t.klar, orange: false }
}

function Rad({ t, onTryck, medMaskin }: { t: PrognosTrakt; onTryck: () => void; medMaskin: boolean }) {
  const s = statusText(t)
  const farg = rollFarg(planeraRoll(t.roll))
  const dampad = t.status === 'hinns_inte' || t.status === 'ingen_maskin'
  const under = [medMaskin ? t.maskin : null, `${fmt(t.kvar)} m³ kvar`, t.takt != null ? `${dec(t.takt)} m³/G15h` : 'takt saknas'].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={onTryck} data-prognos-trakt={t.objekt_id} data-status={t.status} aria-label={`${t.namn}: ${s.text}. Öppna i Planera`}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0`, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: FARG.text }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, background: farg, opacity: dampad ? 0.35 : t.status === 'delvis' ? 0.65 : 1 }} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ ...TYP.text, color: dampad ? FARG.text2 : FARG.text, overflowWrap: 'anywhere' }}>{t.namn}</span>
        <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3 }}>{under}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, flexShrink: 0, maxWidth: '45%', textAlign: 'right', ...TYP.meta, ...TNUM, color: s.orange ? FARG.orange : FARG.text2 }}>
        {s.text}<Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
      </span>
    </button>
  )
}

function ManadensSlut({ datum }: { datum: string }) {
  return (
    <div data-manadens-slut="" role="separator" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.xs}px 0`, ...TYP.micro, color: FARG.text2 }}>
      <span style={{ flex: 1, height: 1, background: FARG.text3 }} />
      <span>Månadens slut {datum}</span>
      <span style={{ flex: 1, height: 1, background: FARG.text3 }} />
    </div>
  )
}

function Svar({ s, r, onTryck }: { s: PrognosSpar; r: PrognosRoll; onTryck: () => void }) {
  const kvarAtt = r.trakter.length
  return (
    <button type="button" onClick={onTryck} data-prognos-svar={`${s.typ}:${r.roll}`} style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: FARG.text, width: '100%' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: RADIE.cirkel, background: rollFarg(planeraRoll(r.roll)) }} />{s.namn} · {r.rubrik}
      </span>
      <span data-prognos-ord="" style={{ ...TYP.rubrik, color: tonFarg(r.ton) }}>{r.ord}</span>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{kvarAtt === 0 ? 'Inga trakter i kö' : `${r.hinns} av ${kvarAtt} trakter hinns${r.delvis > 0 ? ` · ${r.delvis} delvis` : ''}`}</span>
    </button>
  )
}

function PerTrakt({ p, onTrakt }: { p: PrognosData; onTrakt: (typ: Typ, roll: PlaneraRoll) => void }) {
  return (
    <div data-prognos-vy="trakt" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', columnGap: AVSTAND.xxl, rowGap: AVSTAND.xl, alignItems: 'start' }}>
      {p.spar.map(s => s.roller.map(r => (
        <Sektion key={`${s.typ}:${r.roll}`} rubrik={`${s.namn} · ${r.rubrik} · ${r.landar != null ? `landar ${fmt(r.landar)} av ${fmt(s.bestallt)}` : `gjort ${fmt(r.nu)} av ${fmt(s.bestallt)}`}`}>
          {r.trakter.length === 0 && <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga trakter i kön</div>}
          {r.trakter.map((t, i) => (
            <div key={`${t.objekt_id}:${t.maskin_id}`}>
              <Rad t={t} medMaskin onTryck={() => onTrakt(s.typ, planeraRoll(r.roll))} />
              {i === r.linjeEfter - 1 && r.linjeEfter < r.trakter.length && p.slutDatum && <ManadensSlut datum={p.slutDatum} />}
            </div>
          ))}
          {r.linjeEfter === r.trakter.length && r.trakter.length > 0 && p.slutDatum && <ManadensSlut datum={p.slutDatum} />}
          {r.saknar != null && (
            <button type="button" onClick={() => onTrakt(s.typ, planeraRoll(r.roll))} data-prognos-saknar={`${s.typ}:${r.roll}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', ...TYP.text, color: FARG.orange }}>
              <span>Saknas {fmt(r.saknar)} m³ · lägg in trakt</span><Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
            </button>
          )}
        </Sektion>
      )))}
    </div>
  )
}

function PerMaskin({ p, onTrakt }: { p: PrognosData; onTrakt: (typ: Typ, roll: PlaneraRoll) => void }) {
  const typAv = (t: PrognosTrakt): Typ => p.spar.find(s => s.roller.some(r => r.trakter.some(x => x.objekt_id === t.objekt_id && x.roll === t.roll)))?.typ ?? p.spar[0].typ
  return (
    <div data-prognos-vy="maskin" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', columnGap: AVSTAND.xxl, rowGap: AVSTAND.xl, alignItems: 'start' }}>
      {p.maskiner.map(m => (
        <Sektion key={m.maskin_id} rubrik={`${m.namn} · ${m.roll === 'skordare' ? 'Skördare' : 'Skotare'}`}>
          <div data-prognos-maskin={m.maskin_id} style={{ padding: `${AVSTAND.s}px 0` }}>
            {m.korAnnat
              ? <div data-kor-annat="" style={{ ...TYP.listtitel, color: FARG.orange }}>Kör annat just nu — räknas inte in</div>
              : <div style={{ ...TYP.listtitel, ...TNUM }}>{m.hinner == null ? 'Prognos saknas' : `Hinner ${m.ca ? 'ca ' : ''}${fmt(m.hinner)} m³ till månadens slut`}</div>}
            <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{fmt(m.nu)} gjort{m.stopp ? ` · ${m.stopp}` : ''}</div>
          </div>
          {m.trakter.length === 0 && <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga trakter i kön</div>}
          {m.trakter.map(t => <Rad key={`${t.objekt_id}:${t.roll}`} t={t} medMaskin={false} onTryck={() => onTrakt(typAv(t), planeraRoll(m.roll))} />)}
        </Sektion>
      ))}
    </div>
  )
}

// Första sidan: vad ska vi göra? Per spår och maskintyp som inte hinner — de val som flyttar talet, med före och efter (räknade i tavlan),
// störst vinst först. Hinner den, står det en rad. Trakterna, maskinerna och m³/G15h bor bakom "Visa detaljer".
function Enkel({ p, forslag, onTrakt, onMaskin }: { p: PrognosData; forslag: Forslag[]; onTrakt: (typ: Typ, roll: PlaneraRoll) => void; onMaskin: (typ: Typ, objekt_id: string, roll: PlaneraRoll) => void }) {
  const behover = p.spar.flatMap(s => s.roller.map(r => ({ s, r }))).filter(({ r }) => r.ton === 'orange')
  const klara = p.spar.flatMap(s => s.roller.map(r => ({ s, r }))).filter(({ r }) => r.ton !== 'orange')
  return (
    <div data-prognos-enkel="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
      <div data-prognos-rubrik="" style={{ ...TYP.titel }}>{behover.length === 0 ? 'Inget behöver göras' : 'Vad ska vi göra?'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', columnGap: AVSTAND.xxl, rowGap: AVSTAND.xl, alignItems: 'start' }}>
        {behover.map(({ s, r }) => {
          const mina = forslag.filter(f => f.typ === s.typ && f.roll === r.roll)
          return (
            <Sektion key={`${s.typ}:${r.roll}`} rubrik={`${s.namn} · ${r.rubrik} · ${r.ord}`}>
              <div data-forslag-grupp={`${s.typ}:${r.roll}`}>
                {mina.length === 0 && (
                  <button type="button" onClick={() => onTrakt(s.typ, planeraRoll(r.roll))} style={{ ...TYP.text, color: FARG.text2, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: TRAFFYTA.min, textAlign: 'left', width: '100%', padding: `${AVSTAND.s}px 0` }}>
                    Inget enkelt val flyttar talet — öppna Planera
                  </button>
                )}
                {mina.map(f => (
                  <button key={f.id} type="button" data-forslag={f.id} onClick={() => (f.aktion.slag === 'maskin' ? onMaskin(f.typ, f.aktion.objekt_id, planeraRoll(f.roll)) : onTrakt(f.typ, planeraRoll(f.roll)))}
                    style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px 0`, background: 'none', border: 'none', borderTop: `1px solid ${FARG.linje}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: FARG.text }}>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{f.titel}</span>
                      <span style={{ ...TYP.meta, color: FARG.text2 }}>{f.under}</span>
                    </span>
                    {f.efter != null && (
                      <span data-forslag-efter="" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, ...TYP.meta, ...TNUM }}>
                        <span style={{ color: FARG.text2 }}>{f.fore}</span>
                        <span style={{ color: f.eftertons ? tonFarg(f.eftertons) : FARG.text }}>→ {f.efter}</span>
                      </span>
                    )}
                    <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
                  </button>
                ))}
              </div>
            </Sektion>
          )
        })}
      </div>
      {klara.length > 0 && (
        <div data-prognos-klara="" style={{ ...TYP.meta, color: FARG.text2 }}>{klara.map(({ s, r }) => `${s.namn} ${r.rubrik.toLowerCase()}: ${r.ord.toLowerCase()}`).join(' · ')}</div>
      )}
    </div>
  )
}

export default function Prognos({ prognos, forslag, onTrakt, onMaskin }: { prognos: PrognosData; forslag: Forslag[]; onTrakt: (typ: Typ, roll: PlaneraRoll) => void; onMaskin: (typ: Typ, objekt_id: string, roll: PlaneraRoll) => void }) {
  const [vy, setVy] = useState<Vy>('trakt')
  const [detalj, setDetalj] = useState(false)
  if (prognos.spar.length === 0) return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Ingen beställning inlagd</div>
  if (!detalj) {
    return (
      <div data-prognos="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
        <Enkel p={prognos} forslag={forslag} onTrakt={onTrakt} onMaskin={onMaskin} />
        <button type="button" data-visa-detaljer="" onClick={() => setDetalj(true)}
          style={{ ...TYP.text, color: FARG.bla, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: TRAFFYTA.min, textAlign: 'left', padding: 0 }}>Visa detaljer</button>
      </div>
    )
  }
  return (
    <div data-prognos="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
      <button type="button" data-dolj-detaljer="" onClick={() => setDetalj(false)}
        style={{ ...TYP.text, color: FARG.bla, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', minHeight: TRAFFYTA.min, textAlign: 'left', padding: 0 }}>‹ Enkel vy</button>
      <div data-prognos-svar-rad="" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: AVSTAND.s }}>
        {prognos.spar.map(s => s.roller.map(r => <Svar key={`${s.typ}:${r.roll}`} s={s} r={r} onTryck={() => onTrakt(s.typ, planeraRoll(r.roll))} />))}
      </div>
      <div style={{ maxWidth: KOLUMN.smal / 2 }}><Flikkontroll flikar={VYER} aktiv={vy} onVal={setVy} /></div>
      {vy === 'trakt' ? <PerTrakt p={prognos} onTrakt={onTrakt} /> : <PerMaskin p={prognos} onTrakt={onTrakt} />}
    </div>
  )
}
