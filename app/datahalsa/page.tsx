'use client'

// ─────────────────────────────────────────────────────────────
// Datahälsa — BARA DET SOM ÄR FEL JUST NU (Martin 2026-11-25:
// "så enkelt att ett barn förstår direkt").
//
//  1. Överst svaret: "Allt fungerar" eller "N saker är fel" + en rad
//     per problem, i ord, med vad man gör. EN sanning: listan kommer
//     ur lib/datahalsa/felNu och är samma som startsidans prick räknar.
//  2. Ett kort syns bara när det har ett problem NU. Resten ligger
//     bakom EN grå rad längst ner ("Visa allt · 7 kontroller").
//  3. Historiken (läkta fel) står bara där, grått, i ord.
//
// Rött och orange finns bara i svaret. Korten är läsning: inget i dem
// lyser om det inte är ett fel nu. Maskintystnad visas men är aldrig
// ett fel (semester ser ut som fel).
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import Sektion from '@/components/design/Sektion'
import Rad from '@/components/design/Rad'
import Ikon from '@/components/design/Ikon'
import SkotarLassKort from './SkotarLassKort'
import { AVSTAND, FARG, FONT, KNAPP, KORT, RADIE, TRAFFYTA, TYP, medSafeBotten, underTopbar } from '@/lib/design/tokens'
import { IMPORT_LIVE, importLiveVy, kontrollRader, kontrollerSenastKord, narText } from '@/lib/datahalsa/status'
import { SEKTIONER, laktText, serieNamn, serieVad, type Problem, type SektionId } from '@/lib/datahalsa/felNu'
import { useDatahalsa, type Besked, type Datahalsa, type LeveransRad } from './useDatahalsa'

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const datumKort = (d: string) => `${Number(d.slice(8, 10))} ${MANADER[Number(d.slice(5, 7)) - 1] ?? ''}`

function tidSedan(iso: string | null): string {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `för ${min} min sedan`
  const tim = Math.round(min / 60)
  if (tim < 48) return `för ${tim} tim sedan`
  return `för ${Math.round(tim / 24)} dygn sedan`
}

// "19 min" / "2 h 20 min" — tid i människoord, aldrig decimaltimmar
function minText(sek: number): string {
  const min = Math.round(sek / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const PRICK: Record<Besked['niva'], string> = {
  gron: FARG.gron, rod: FARG.rod, gul: FARG.orange, okant: FARG.text3, laddar: FARG.text3,
}

/** Leveransen i ord. Aldrig en färg: tystnad kan vara semester och är inget fel. */
function levText(m: LeveransRad): { text: string; dampad: boolean } {
  if (m.aktivTill) return { text: `ur drift ${m.aktivTill.slice(0, 10)}`, dampad: true }
  if (!m.sanderFiler) return { text: 'skickar inga filer', dampad: true }
  if (m.senasteData == null || m.dagarSedan == null) return { text: 'ingen data än', dampad: true }
  return { text: m.dagarSedan <= 0 ? 'i dag' : m.dagarSedan === 1 ? 'i går' : `${m.dagarSedan} dagar sedan`, dampad: false }
}

const SEKTION_RUBRIK: Record<SektionId, string> = {
  filer: 'Kommer filerna in?',
  leverans: 'Levererar maskinerna?',
  importfel: 'Tappades något vid import?',
  invarianter: 'Är datan galen?',
  kontroller: 'Kontroller på importdatorn',
  koordinat: 'Objekt utan koordinat',
  skotarlass: 'Skotarens lass',
}

/** En rad som säger att kortet inte gick att läsa — aldrig ett tomt kort som ser ut som "inget". */
function KundeInteLasa({ fel }: { fel: string }) {
  // Feltexten kan vara en lång adress utan mellanslag: den får brytas var som helst (mätt i Chromium, 360 px).
  return <Rad sista titel="Kunde inte läsas" under={<span style={{ overflowWrap: 'anywhere' }}>{fel}</span>} />
}
function Laser() {
  return <Rad sista dampad titel="Läser …" />
}

// ── SVARET — det enda på sidan som lyser ──
function Svar({ besked, problem, kontrollerat, onForsokIgen }: {
  besked: Besked; problem: Problem[]; kontrollerat: string | null; onForsokIgen: () => void
}) {
  return (
    <section data-testid="svar" data-niva={besked.niva} aria-live="polite"
      style={{ ...KORT, marginBottom: AVSTAND.xl, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <span aria-hidden data-testid="svar-prick"
          style={{ width: AVSTAND.l, height: AVSTAND.l, borderRadius: RADIE.cirkel, background: PRICK[besked.niva], flexShrink: 0 }} />
        <h1 data-testid="svar-rubrik" style={{ ...TYP.titel, color: FARG.text, margin: 0 }}>{besked.rubrik}</h1>
      </div>
      {problem.length > 0 && (
        <ul data-testid="svar-problem" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {problem.map((p, i) => (
            <li key={p.id} data-problem={p.id} data-sektion={p.sektion}
              style={{ padding: `${AVSTAND.m}px 0`, borderTop: `1px solid ${FARG.linje}`, paddingBottom: i === problem.length - 1 ? 0 : AVSTAND.m }}>
              <div style={{ ...TYP.listtitel, color: FARG.text, overflowWrap: 'anywhere' }}>{p.text}</div>
              {p.gor && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, overflowWrap: 'anywhere' }}>{p.gor}</div>}
              {p.lasfel && (
                <button type="button" onClick={onForsokIgen} style={{ ...KNAPP.tertiar, minWidth: TRAFFYTA.min }}>Försök igen</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {besked.niva === 'gron' && kontrollerat && (
        <div data-testid="svar-kontrollerat" style={{ ...TYP.meta, color: FARG.text3 }}>{kontrollerat}</div>
      )}
    </section>
  )
}

// ── KORTEN — läsning. Samma kort oavsett om det står uppe (har ett problem) eller under "Visa allt". ──

function FilerKort({ d }: { d: Datahalsa }) {
  const live = importLiveVy((d.status.data ?? []).find((r) => r.id === IMPORT_LIVE) ?? null, Date.now())
  return (
    <Sektion rubrik={SEKTION_RUBRIK.filer}>
      {d.status.laddar ? <Laser /> : d.status.fel || d.status.tabellSaknas ? <KundeInteLasa fel={d.status.fel ?? 'Statusraderna saknas'} /> : (
        <Rad titel="Importen just nu" attr={{ 'data-rad': 'import-live' }}
          under={<>{live.rader.map((r) => <div key={r} style={{ overflowWrap: 'anywhere' }}>{r}</div>)}{live.kontrollerad && <div>{live.kontrollerad}</div>}</>}
          hoger={live.lage === 'ok' ? 'Fungerar' : live.lage === 'larm' ? 'Felar' : 'Kontrolleras inte'} />
      )}
      {d.filer.laddar ? <Laser /> : d.filer.fel ? <KundeInteLasa fel={d.filer.fel} /> : (
        <>
          <Rad titel="Senaste fil" hoger={tidSedan(d.filer.data?.senasteImport ?? null)} />
          <Rad sista titel="Senaste 7 dagarna" hoger={`${d.filer.data?.filer7d.length ?? 0} filer`} />
        </>
      )}
    </Sektion>
  )
}

function LeveransKort({ d }: { d: Datahalsa }) {
  const rader = d.leverans.data ?? []
  return (
    <Sektion rubrik={SEKTION_RUBRIK.leverans} not="Senaste dag med data. Tystnad kan vara semester eller uppehåll och är inget fel.">
      {d.leverans.laddar ? <Laser /> : d.leverans.fel ? <KundeInteLasa fel={d.leverans.fel} /> : rader.length === 0 ? <Rad sista dampad titel="Inga maskiner" /> : (
        rader.map((m, i) => {
          const l = levText(m)
          return <Rad key={m.maskinId} sista={i === rader.length - 1} dampad={l.dampad} titel={m.namn}
            under={m.bekraftad ? undefined : 'Ny maskin – inte bekräftad'} hoger={l.text} />
        })
      )}
    </Sektion>
  )
}

function ImportfelKort({ d }: { d: Datahalsa }) {
  const b = d.importfel
  const nu = Date.now()
  const maskin = (id: string) => (d.leverans.data ?? []).find((m) => m.maskinId.toUpperCase() === id.toUpperCase())?.namn ?? id
  const gamla = d.filer.data?.gamlaFel
  const laddar = d.importFel.laddar || d.filer.laddar
  const fel = d.importFel.fel ?? d.filer.fel
  const historik: { nyckel: string; titel: string; under: string }[] = []
  if (b) {
    for (const s of b.laktaSerier) {
      historik.push({ nyckel: `l:${s.nyckel}`, titel: serieNamn(s, maskin), under: `${serieVad(s)} ${narText(s.sistaFel, nu)}. ${laktText(s)}.` })
    }
    for (const s of b.gamlaSerier) {
      historik.push({ nyckel: `g:${s.nyckel}`, titel: serieNamn(s, maskin), under: `${serieVad(s)} ${narText(s.sistaFel, nu)}. Läkte aldrig – för gammalt för att räknas som ett fel nu.` })
    }
    if (b.ofarliga > 0) {
      historik.push({ nyckel: 'ofarliga', titel: `${b.ofarliga} avvisade dubbletter`, under: 'Ofarligt – raderna fanns redan i databasen.' })
    }
  }
  if (gamla && gamla.antal > 0) {
    const period = gamla.forsta && gamla.sista ? ` ${datumKort(gamla.forsta)}–${datumKort(gamla.sista)}` : ''
    historik.push({ nyckel: 'gamla', titel: `${gamla.antal} äldre filer med fel`, under: `Filloggen${period}. Inget av dem är ett fel nu.` })
  }
  const nuSerier = b?.nuSerier ?? []
  return (
    <Sektion rubrik={SEKTION_RUBRIK.importfel}>
      {laddar ? <Laser /> : fel ? <KundeInteLasa fel={fel} /> : (
        <>
          {nuSerier.length === 0 && (
            <Rad sista={historik.length === 0} titel="Inga fel just nu" attr={{ 'data-rad': 'importfel-inga' }}
              under="Ett fel räknas tills nästa fil från samma objekt har gått in." />
          )}
          {nuSerier.map((s, i) => (
            <Rad key={s.nyckel} sista={historik.length === 0 && i === nuSerier.length - 1} attr={{ 'data-rad': 'importfel-nu' }}
              titel={s.antalFiler === 0 ? serieVad(s) : serieNamn(s, maskin)}
              under={<>
                {s.antalFiler > 0 && <div>{serieVad(s)} · senast {narText(s.sistaFel, nu)}</div>}
                {s.tabeller.length > 0 && <div style={{ overflowWrap: 'anywhere' }}>Skrevs inte: {s.tabeller.join(', ')}</div>}
                <div style={{ overflowWrap: 'anywhere' }}>{s.orsak}</div>
              </>} />
          ))}
          {historik.length > 0 && (
            <div data-testid="importfel-historik">
              <div style={{ ...TYP.micro, color: FARG.text3, padding: `${AVSTAND.m}px 0 0` }}>Historik</div>
              {historik.map((h, i) => <Rad key={h.nyckel} dampad sista={i === historik.length - 1} titel={h.titel} under={h.under} />)}
            </div>
          )}
        </>
      )}
    </Sektion>
  )
}

function InvarianterKort({ d }: { d: Datahalsa }) {
  const inv = d.invarianter.data
  const flytt = inv?.motorUtanArbete ?? []
  return (
    <Sektion rubrik={SEKTION_RUBRIK.invarianter}>
      {d.invarianter.laddar ? <Laser /> : d.invarianter.fel || !inv ? <KundeInteLasa fel={d.invarianter.fel ?? 'Ingen data'} /> : (
        <>
          <Rad titel="Dagar med mer än 24 timmar motortid" hoger={String(inv.over24h.length)} dampad={inv.over24h.length === 0}
            under={inv.over24h.length === 0 ? undefined : inv.over24h.map((x) => <div key={x.maskin + x.datum}>{x.maskin} {datumKort(x.datum)}: {x.timmar.toFixed(1)} h</div>)} />
          <Rad titel="Två förare med exakt samma tid" hoger={String(inv.dubbletter.length)} dampad={inv.dubbletter.length === 0}
            under={inv.dubbletter.length === 0 ? undefined : inv.dubbletter.map((x) => <div key={x.maskin + x.datum + x.objekt}>{x.maskin} {datumKort(x.datum)} · objekt {x.objekt}: {x.antal} lika rader</div>)} />
          <Rad titel="Tomgång som inte går ihop" hoger={String(inv.tomgangInkonsistenta)} dampad={inv.tomgangInkonsistenta === 0} />
          <Rad sista dampad titel="Motorn gick utan arbetstid" hoger={`${flytt.length} ${flytt.length === 1 ? 'dag' : 'dagar'}`}
            under={flytt.length === 0 ? 'Väntat vid flytt.' : `Väntat vid flytt. Senast ${datumKort(flytt[0].datum)} · ${flytt[0].namn} · ${flytt[0].objektnamn} (${minText(flytt[0].motorSek)}).`} />
        </>
      )}
    </Sektion>
  )
}

function KontrollerKort({ d }: { d: Datahalsa }) {
  const kontroller = kontrollRader(d.status.data ?? [])
  const korda = narText(kontrollerSenastKord(d.status.data ?? []), Date.now())
  return (
    <Sektion rubrik={SEKTION_RUBRIK.kontroller}>
      {d.status.laddar ? <Laser /> : d.status.fel || d.status.tabellSaknas ? <KundeInteLasa fel={d.status.fel ?? 'Statusraderna saknas'} /> : kontroller.length === 0 ? (
        <Rad sista titel="Ingen körning registrerad" under="Raderna skrivs när kontrollen på importdatorn har kört." />
      ) : (
        <div data-testid="kontroller">
          <Rad dampad titel="Senast körda" hoger={korda ?? '—'} />
          {kontroller.map((k, i) => (
            <Rad key={k.id} sista={i === kontroller.length - 1} dampad={k.lage === 'ok'} titel={k.namn}
              attr={{ 'data-kontroll': k.id, 'data-lage': k.lage }}
              hoger={k.lage === 'ok' ? 'Inga larm' : k.lage === 'larm' ? (k.larmAntal > 1 ? `${k.larmAntal} larm` : 'Larm') : 'Okänt'}
              under={k.rader.length === 0 ? undefined : k.rader.map((r) => <div key={r} style={{ overflowWrap: 'anywhere' }}>{r}</div>)} />
          ))}
        </div>
      )}
    </Sektion>
  )
}

function KoordinatKort({ d }: { d: Datahalsa }) {
  const k = d.koordinatLarm.data
  return (
    <Sektion rubrik={SEKTION_RUBRIK.koordinat} not="Utan koordinat kan vägen till objektet inte räknas, och dagen får 0 km i löneunderlaget.">
      {d.koordinatLarm.laddar ? <Laser /> : d.koordinatLarm.fel || !k ? <KundeInteLasa fel={d.koordinatLarm.fel ?? 'Ingen data'} /> : k.koordlosa.length === 0 && k.dupTrakt.length === 0 ? (
        <Rad sista dampad titel="Alla objekt med arbetsdagar har koordinat" under="De senaste 60 dagarna." />
      ) : (
        <>
          {k.dupTrakt.map((t) => (
            <Rad key={`dup-${t.objektnr}`} titel={`Objektnr ${t.objektnr} ligger på flera VO-nummer`}
              under={t.vo.map((v) => <div key={v.objekt_id}>VO {v.objekt_id} · {v.objektnamn} · {v.harKoord ? 'har koordinat' : 'saknar koordinat'}</div>)} />
          ))}
          {k.koordlosa.map((x, i) => (
            <Rad key={`${x.medarbetare}-${x.datum}-${x.objekt_id}-${i}`} sista={i === k.koordlosa.length - 1}
              titel={x.objektnamn} under={`${datumKort(x.datum)} · ${x.medarbetare} · VO ${x.objekt_id}`} />
          ))}
        </>
      )}
    </Sektion>
  )
}

function Kortet({ id, d }: { id: SektionId; d: Datahalsa }) {
  return (
    <div data-kort={id}>
      {id === 'filer' ? <FilerKort d={d} />
        : id === 'leverans' ? <LeveransKort d={d} />
        : id === 'importfel' ? <ImportfelKort d={d} />
        : id === 'invarianter' ? <InvarianterKort d={d} />
        : id === 'kontroller' ? <KontrollerKort d={d} />
        : id === 'koordinat' ? <KoordinatKort d={d} />
        : <SkotarLassKort vidGranskat={d.lasOmLass} />}
    </div>
  )
}

export default function DatahalsaPage() {
  const d = useDatahalsa()
  const [visaAllt, setVisaAllt] = useState(false)

  // Kort med ett problem NU står uppe. Resten ligger bakom raden längst ner.
  const medProblem = SEKTIONER.filter((id) => d.problem.some((p) => p.sektion === id))
  const utanProblem = SEKTIONER.filter((id) => !medProblem.includes(id))
  const laddar = d.besked.niva === 'laddar'

  const nu = Date.now()
  const live = importLiveVy((d.status.data ?? []).find((r) => r.id === IMPORT_LIVE) ?? null, nu)
  const korda = narText(kontrollerSenastKord(d.status.data ?? []), nu)
  const kontrollerat = [live.kontrollerad ? live.kontrollerad.replace(/^Senast kontrollerad/, 'Importen kontrollerad') : null, korda ? `importdatorn ${korda}` : null]
    .filter(Boolean).join(' · ') || null

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: FARG.bg, color: FARG.text, fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
    }}>
      <main style={{
        maxWidth: 560, margin: '0 auto', boxSizing: 'border-box',
        padding: `${underTopbar(AVSTAND.l)} ${AVSTAND.sidmarginal}px ${medSafeBotten(AVSTAND.xxl)}`,
      }}>
        <Svar besked={d.besked} problem={d.problem} kontrollerat={kontrollerat} onForsokIgen={d.lasOm} />

        {!laddar && medProblem.map((id) => <Kortet key={id} id={id} d={d} />)}

        {!laddar && utanProblem.length > 0 && (
          <>
            <button type="button" data-testid="visa-allt" aria-expanded={visaAllt} onClick={() => setVisaAllt((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%',
                minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, marginBottom: AVSTAND.xl, boxSizing: 'border-box',
                background: FARG.kort, border: 'none', borderRadius: RADIE.kort, cursor: 'pointer', fontFamily: 'inherit',
                ...TYP.text, color: FARG.text2, textAlign: 'left',
              }}>
              <span>
                {visaAllt ? 'Dölj' : medProblem.length === 0 ? 'Visa allt' : 'Visa det som fungerar'}
                {' · '}{utanProblem.length} {utanProblem.length === 1 ? 'kontroll' : 'kontroller'}
              </span>
              <Ikon namn={visaAllt ? 'expand_less' : 'expand_more'} farg={FARG.text3} />
            </button>
            {visaAllt && <div data-testid="allt">{utanProblem.map((id) => <Kortet key={id} id={id} d={d} />)}</div>}
          </>
        )}
      </main>
    </div>
  )
}
