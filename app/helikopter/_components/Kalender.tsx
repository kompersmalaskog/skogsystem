'use client'

// KALENDER (2026-11-25, Martin: "bara från idag och framåt", hela skärmen, Apple-design som skissen): vem gör vad, dag för dag, från idag.
// BARA DATA: en stapel finns bara för trakten maskinen är på nu (längd = det som är kvar på maskinens egen takt). Trakterna efter står som text — nästa och
// därefter — utan stapel och datum. Maskin som kör annat får bara det den kör. Logiken är _lib/lage.ts (byggTidslinje); den här filen ritar.
import Ikon from '@/components/design/Ikon'
import Sektion from '@/components/design/Sektion'
import { AVSTAND, FARG, IKON, KORT, RADIE, TNUM, TRAFFYTA, TYP, underTopbar } from '@/lib/design/tokens'
import { rollFarg } from '@/lib/sparStil'
import { KLAR_TYP_NAMN, type KlarTyp } from '../_lib/klar'
import { fmt, fmtDag, relativTid } from '../_lib/format'
import type { KoPost, TidsBar, TidsRad, Tidslinje } from '../_lib/lage'
import { OrdningsBar, pilar, type OrdningsStyrning } from './Tavla'
import type { KorNu } from '../_lib/queries'

/** Sidan fyller skärmen nedåt: höjden är fönstret minus toppfältet och rubrikerna över kortet. */
const OVER_KORTET = AVSTAND.xxl * 7
const BAR_HOJD = TRAFFYTA.min + AVSTAND.s
const arStapel = (b: TidsBar) => b.stil === 'klar' || b.stil === 'efter' || b.stil === 'saknas'

function Stapel({ b, farg, n }: { b: TidsBar; farg: string; n: number }) {
  const bredd = Math.max(0, Math.min(b.langd, n - b.start))
  const bas = { position: 'absolute', top: 0, height: BAR_HOJD, left: `${(b.start / n) * 100}%`, width: `${(bredd / n) * 100}%`, borderRadius: RADIE.knapp, display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.m}px`, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', ...TYP.listtitel } as const
  if (b.stil === 'saknas') return <span data-kal-stapel="saknas" title={b.text} style={{ ...bas, border: `1px dashed ${FARG.orange}`, color: FARG.orange }}>{b.text}</span>
  // Klar-datumet står i stapeln; sträcker den sig förbi de dagar som ritas fortsätter den med en pil.
  const text = `${b.text}${b.klarDatum ? ` · klar ${fmtDag(b.klarDatum)}` : ''}${b.start + b.langd > n ? ' →' : ''}`
  const fore = b.langd > 0 ? Math.min(1, (b.fore * b.langd) / Math.max(bredd, 1e-9)) : 0
  const bg = b.stil === 'efter' ? `linear-gradient(90deg, ${farg} ${fore * 100}%, ${FARG.orange} ${fore * 100}%)` : farg
  return <span data-kal-stapel={b.stil} title={text} style={{ ...bas, background: bg, color: FARG.bg }}>{text}</span>
}

/** Kön i körordning: en rad per trakt med vad som behövs för beställningen, och pilar när du får ändra ordningen. */
function KoLista({ ko, st }: { ko: KoPost[]; st?: OrdningsStyrning }) {
  const grupp = ko.filter(k => !k.fast).map(k => k.objekt_id)
  return (
    <div data-kal-ko="" style={{ display: 'flex', flexDirection: 'column' }}>
      {ko.map((k, i) => {
        const p = pilar(grupp, k.objekt_id, st)
        const status = k.behovs == null ? '' : k.behovs > 0 ? 'behövs' : 'behövs inte'
        const pil = (ikon: string, on: (() => void) | null | undefined, etikett: string) => (
          <button type="button" aria-label={`${etikett}: ${k.namn}`} onClick={on ?? undefined} disabled={!on} data-kal-pil={ikon} style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, background: 'none', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: on ? 1 : 0.25 }}><Ikon namn={ikon === 'up' ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} storlek={IKON.rad} farg={FARG.text2} /></button>
        )
        return (
          <div key={k.objekt_id} data-kal-ko-rad={k.objekt_id} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: TRAFFYTA.min }}>
            <span style={{ ...TYP.meta, ...TNUM, color: FARG.text3, minWidth: AVSTAND.l }}>{i + 1}</span>
            <span style={{ ...TYP.text, color: status === 'behövs inte' ? FARG.text2 : FARG.text, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{k.namn}</span>
            <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2, whiteSpace: 'nowrap' }}>{fmt(k.kvar)} m³{status ? ` · ${status}` : ''}</span>
            {st && <span style={{ display: 'flex' }}>{pil('up', p.upp, 'Flytta upp')}{pil('down', p.ner, 'Flytta ned')}</span>}
          </div>
        )
      })}
    </div>
  )
}

function MaskinRad({ r, t, nu, ordning }: { r: TidsRad; t: Tidslinje; nu?: KorNu; ordning?: OrdningsStyrning }) {
  const farg = rollFarg(r.roll)
  const n = t.dagar.length
  const stapel = r.barer.filter(arStapel)
  const typ = nu?.typ && nu.typ !== 'slutavverkning' && nu.typ !== 'gallring' ? ` (${KLAR_TYP_NAMN[nu.typ as KlarTyp] ?? nu.typ})` : ''
  return (
    <div data-kal-maskin={r.maskin_id} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: AVSTAND.s, padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.listtitel }}>
        <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
        {r.namn}<span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 400 }}>{r.roll === 'skordare' ? 'skördare' : 'skotare'}</span>
      </div>
      {r.korAnnat ? (
        <div data-kal-kor-annat="" style={{ ...TYP.text, color: FARG.text2 }}>
          {nu ? `Kör ${nu.namn ?? 'annat'}${typ} · ${relativTid(nu.tid ?? `${nu.datum}T12:00:00`)}` : 'Kör annat'} · räknas inte in i prognosen
        </div>
      ) : (
        <>
          {stapel.length > 0 && (
            <div style={{ position: 'relative', height: BAR_HOJD }}>
              {stapel.map(b => <Stapel key={b.id} b={b} farg={farg} n={n} />)}
            </div>
          )}
          {(r.ko?.length ?? 0) > 0 ? <KoLista ko={r.ko ?? []} st={ordning} /> : <div style={{ ...TYP.text, color: FARG.text2 }}>Inget i kön</div>}
        </>
      )}
    </div>
  )
}

export default function Kalender({ tidslinje, korNu, manadNamn, ar, ordning }: { tidslinje: Tidslinje | null; korNu: KorNu[] | null; manadNamn: string; ar: number; ordning?: OrdningsStyrning }) {
  if (!tidslinje || tidslinje.rader.length === 0) {
    return <div data-kalender="" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Kalendern visas för en pågående månad med maskinernas köer.</div>
  }
  const t = tidslinje
  const n = t.dagar.length
  const andel = t.slut / n
  const slutLage = andel > 0.8 ? { right: 0 } : andel < 0.2 ? { left: 0 } : { left: `${andel * 100}%`, transform: 'translateX(-50%)' }
  return (
    <div data-kalender="" style={{ display: 'flex', flexDirection: 'column', minHeight: `calc(100dvh - ${underTopbar(OVER_KORTET)})` }}>
      <h1 style={{ margin: 0, padding: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, ...TYP.titel, color: FARG.text }}>Kalender</h1>
      <p style={{ margin: `0 0 ${AVSTAND.xl}px`, ...TYP.text, color: FARG.text2 }}>Från idag, {manadNamn.toLowerCase()} {ar}. Stapeln är trakten maskinen är på nu. Under den står kön i körordning och vad som behövs för beställningen — utan datum.</p>
      {ordning && <OrdningsBar st={ordning} primar />}
      <Sektion rubrik="Vem gör vad, dag för dag" kort={false} className="hk-kal-sektion">
        <div style={{ ...KORT, display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ position: 'relative', paddingTop: AVSTAND.l }}>
            <span data-kal-slut="" style={{ position: 'absolute', top: 0, ...slutLage, ...TYP.micro, color: FARG.orange, whiteSpace: 'nowrap' }}>Månadens slut</span>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, textAlign: 'center', marginBottom: AVSTAND.m }}>
              {t.dagar.map((d, i) => (
                <span key={i} style={{ display: 'flex', flexDirection: 'column', ...TYP.listtitel, ...TNUM, color: FARG.text, minWidth: 0 }}>
                  <span>{d.dag}</span><span style={{ ...TYP.micro, color: i === 0 ? FARG.text : FARG.text3 }}>{i === 0 ? 'idag' : d.vdag}</span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {t.rader.map(r => <MaskinRad key={r.maskin_id} r={r} t={t} nu={korNu?.find(k => k.maskin_id === r.maskin_id)} ordning={ordning} />)}
            {t.slut < n && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${andel * 100}%`, width: AVSTAND.xs / 2, marginLeft: -AVSTAND.xs / 4, background: FARG.orange, borderRadius: AVSTAND.xs / 4, pointerEvents: 'none' }} />}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.l, ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.l }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: FARG.text2 }} />klar i {manadNamn.toLowerCase()}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, background: FARG.orange }} />efter månadens slut</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: AVSTAND.xs, border: `1px dashed ${FARG.orange}`, boxSizing: 'border-box' }} />prognos saknas</span>
          </div>
        </div>
      </Sektion>
    </div>
  )
}
