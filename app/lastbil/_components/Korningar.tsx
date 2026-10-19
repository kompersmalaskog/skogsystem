'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { TryckRad } from './AttGoraKort';
import Periodval from './Periodval';
import RundaRad from './RundaRad';
import { fmtDatum } from './nu';
import { laddaNerCsv } from './csv';
import { manaderIAr, manadForStart, periodEtikett, periodKort, periodTillText, type Period } from './period';
import { fmtLPerMil, rundorTillCsv, summera, type Runda, type Summa } from './rundor';
import type { RundorLage } from './useRundor';

type Filter = 'alla' | 'flytt' | 'ovrig';

function Status({ text, alert }: { text: string; alert?: boolean }) {
  return <p role={alert ? 'alert' : 'status'} style={{ ...TYP.text, color: alert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>{text}</p>;
}

const litTxt = (s: Summa) => (s.liter != null ? `${s.liter.toLocaleString('sv-SE')} l` : 'diesel saknas i datan');
/** Årsvyn: "5 rundor · 349 l · 4,3 l/mil" (liter står kvar här — årsvyn är orörd). */
const metaRad = (s: Summa) =>
  [`${s.antal} ${s.antal === 1 ? 'runda' : 'rundor'}`, litTxt(s), fmtLPerMil(s.lPerMil) ? `${fmtLPerMil(s.lPerMil)} l/mil` : null].filter(Boolean).join(' · ');
const rundorText = (n: number) => `${n} ${n === 1 ? 'runda' : 'rundor'}`;
/** "4,3 l/mil", eller "diesel saknas i datan" när ingen runda har diesel och mätare (aldrig 0). */
const lPerMilText = (lPerMil: number | null) => (fmtLPerMil(lPerMil) ? `${fmtLPerMil(lPerMil)} l/mil` : 'diesel saknas i datan');
/** Månadens EN dämpade rad under det stora talet: "5 rundor · 4,3 l/mil" (inga liter). */
const manadsRad = (s: Summa) => `${rundorText(s.antal)} · ${lPerMilText(s.lPerMil)}`;
/** Urvalets rad överst i listan: "2 rundor · 3,9 l/mil"; en rundtyp utan rundor säger bara antalet. */
const urvalsRad = (antal: number, lPerMil: number | null) => (antal === 0 ? rundorText(0) : `${rundorText(antal)} · ${lPerMilText(lPerMil)}`);

/** Anmärkningar som gäller summan: sägs i klartext, aldrig tyst. */
function Anmarkningar({ s }: { s: Summa }) {
  const rader = [
    s.overlappande > 0 && `${s.overlappande} rundor överlappar i tid och kan vara dubbelräknade i summorna.`,
    s.ogiltiga > 0 && `${s.ogiltiga} ${s.ogiltiga === 1 ? 'runda har' : 'rundor har'} sluttid före start och ingår inte i summorna.`,
    s.pagande > 0 && `${s.pagande} ${s.pagande === 1 ? 'runda pågår' : 'rundor pågår'} och räknas när de avslutats.`,
  ].filter(Boolean) as string[];
  if (!rader.length) return null;
  return <div>{rader.map(t => <p key={t} style={{ ...TYP.meta, color: FARG.orange, margin: `0 0 ${AVSTAND.xs}px` }}>{t}</p>)}</div>;
}

/**
 * Körningar — "vad har bilen gjort och vad drog det?". Rubriken, "‹ Oktober 2026 ›" (ingen Månad/År-växel här), månaden i ett kort:
 * körd km (ETT stort tal) och EN dämpad rad "5 rundor · 4,3 l/mil"; två rader i ett eget kort ("Flyttar 296 km ›", "Övrig körning
 * 522 km ›") som filtrerar listan och då visar urvalets "2 rundor · 3,9 l/mil" + "Visa alla" överst i den; sedan ETT kort med alla
 * rundor i månaden, nyast först, utan veckorubriker. Detaljen ligger i arket. Årsvyn finns kvar (`?per=2026`, fakturasidans växel)
 * men har ingen dörr härifrån. Alla rundor räknas på sin svenska startdag. Är månaden tom öppnar "Senaste körning: <datum>" den
 * senaste rundans ark.
 */
export default function Korningar({ period, onPeriod, lage, onForsokIgen, onOppna, senaste, onOppnaSenaste }: {
  period: Period; onPeriod: (p: Period) => void; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void;
  /** Bilens senaste avslutade körning (ur Bilen nu), för tomtexten i en tom månad. */
  senaste: { id: string; start: string } | null; onOppnaSenaste: (r: { id: string; start: string }) => void;
}) {
  // Filtret hör till perioden: byter man period börjar man om (ett kvarglömt filter vore ett falskt tomläge).
  return (
    <section aria-label="Körningar" data-korningar>
      <h2 style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.rubrik, color: FARG.text }}>Körningar</h2>
      <div style={{ marginBottom: AVSTAND.m }}>
        <Periodval period={period} onPeriod={onPeriod} utanVaxel />
      </div>
      <Inre key={periodTillText(period)} period={period} lage={lage} onForsokIgen={onForsokIgen} onOppna={onOppna} onValjManad={onPeriod} senaste={senaste} onOppnaSenaste={onOppnaSenaste} />
      <FlyttplatserLank />
    </section>
  );
}

/** Flyttplatserna (snabbvalen i förarflödet) hanteras på egen sida — länken bodde i Flyttloggen och bor nu här. */
function FlyttplatserLank() {
  return (
    <Link href="/maskinflytt/platser" style={{ ...KNAPP.tertiar, textDecoration: 'none', display: 'flex', justifyContent: 'center', marginTop: AVSTAND.m }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>add_location_alt</span>
      Flyttplatser — hantera
    </Link>
  );
}

function Inre({ period, lage, onForsokIgen, onOppna, onValjManad, senaste, onOppnaSenaste }: {
  period: Period; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void; onValjManad: (p: Period) => void;
  senaste: { id: string; start: string } | null; onOppnaSenaste: (r: { id: string; start: string }) => void;
}) {
  const [filter, setFilter] = useState<Filter>('alla');
  const rundor = lage.lage === 'klar' ? lage.rundor : null;
  const summa = useMemo(() => (rundor ? summera(rundor) : null), [rundor]);
  // ETT kort med alla rundor, nyast först (ingen veckoindelning).
  const synliga = useMemo(
    () => (rundor ?? []).filter(r => filter === 'alla' || (filter === 'flytt' ? r.flytt : !r.flytt)).sort((a, b) => Date.parse(b.start) - Date.parse(a.start)),
    [rundor, filter],
  );

  if (lage.lage === 'laddar') return <Status text="Läser körningar …" />;
  if (lage.lage === 'fel' || !rundor || !summa) {
    return (
      <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
        <Status text="Kunde inte läsa körningarna just nu." alert />
        <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </div>
    );
  }

  if (period.typ === 'ar') return <ArsVy period={period} rundor={rundor} summa={summa} onValjManad={onValjManad} />;

  // Raden fyller kortets hela bredd när den är vald (negativ marginal ut i kortets padding); avdelaren under ligger inne i kortet.
  const filterRad = (id: Exclude<Filter, 'alla'>, namn: string, km: number, sista: boolean) => (
    <div style={{ borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <button type="button" aria-pressed={filter === id} data-filter={id} onClick={() => setFilter(filter === id ? 'alla' : id)}
        style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: `calc(100% + ${2 * AVSTAND.l}px)`, margin: `0 -${AVSTAND.l}px`, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, background: filter === id ? FARG.fyllning : 'none', border: 'none', textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
        <span style={{ ...TYP.listtitel, color: FARG.text, flex: 1, minWidth: 0 }}>{namn}</span>
        <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{km.toLocaleString('sv-SE')} km</span>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
      </button>
    </div>
  );
  const urval = filter === 'flytt'
    ? { antal: summa.flytt, lPerMil: summa.lPerMilFlytt }
    : filter === 'ovrig' ? { antal: summa.ovrig, lPerMil: summa.lPerMilOvrig } : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {/* Månaden: ETT stort tal och EN dämpad rad */}
      <section style={KORT} aria-label="Månaden">
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Körd i {periodKort(period)}</div>
        <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km</div>
        <div data-manadsrad style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{manadsRad(summa)}</div>
      </section>

      {/* Två rader i eget kort: ett tryck filtrerar listan */}
      <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }} aria-label="Typ av körning">
        {filterRad('flytt', 'Flyttar', summa.kmFlytt, false)}
        {filterRad('ovrig', 'Övrig körning', summa.kmOvrig, true)}
      </section>

      {/* Rundorna: ETT kort, nyast först */}
      {urval && (
        <div data-urval style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m }}>
          <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{urvalsRad(urval.antal, urval.lPerMil)}</span>
          <button type="button" onClick={() => setFilter('alla')} style={{ ...KNAPP.lank, ...TYP.meta }}>Visa alla</button>
        </div>
      )}
      {synliga.length === 0 ? (
        <div>
          <p data-tom style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
            {rundor.length === 0 ? `Inga rundor i ${periodKort(period)}. Körningarna lästes utan fel.` : 'Inga rundor av den typen i månaden.'}
          </p>
          {rundor.length === 0 && senaste && (
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.s }}>
              <TryckRad attr={{ 'data-senaste-korning': '' }} sista text={`Senaste körning: ${fmtDatum(senaste.start)}`} onTryck={() => onOppnaSenaste(senaste)} />
            </div>
          )}
        </div>
      ) : (
        <section aria-label="Rundor" data-rundlista style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
          {synliga.map((r, i) => <RundaRad key={r.id} runda={r} sista={i === synliga.length - 1} onOppna={onOppna} />)}
        </section>
      )}

      <Anmarkningar s={summa} />
      <button type="button" disabled={rundor.length === 0}
        onClick={() => laddaNerCsv(rundorTillCsv(rundor), `rundor-${periodTillText(period)}.csv`)}
        style={{ ...KNAPP.tertiar, alignSelf: 'center', opacity: rundor.length === 0 ? 0.4 : 1 }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>download</span>
        Exportera {periodEtikett(period).toLowerCase()} som CSV
      </button>
    </div>
  );
}

/** År: månaderna som rader. Ett tryck går till månaden. En månad utan rundor syns med det. */
function ArsVy({ period, rundor, summa, onValjManad }: { period: Extract<Period, { typ: 'ar' }>; rundor: Runda[]; summa: Summa; onValjManad: (p: Period) => void }) {
  const manader = manaderIAr(period.ar);
  const perManad = manader.map(m => {
    const rs = rundor.filter(r => { const x = manadForStart(r.start); return x?.ar === m.ar && x.man === m.man; });
    return { m, s: summera(rs) };
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <section style={KORT} aria-label="Året">
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Körd {period.ar}</div>
        <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km</div>
        <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{metaRad(summa)}</div>
      </section>
      <section style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} aria-label="Månader">
        {perManad.map(({ m, s }, i) => (
          <button key={m.man} type="button" onClick={() => onValjManad(m)}
            style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, background: 'none', border: 'none', borderBottom: i === perManad.length - 1 ? 'none' : `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...TYP.listtitel, color: FARG.text }}>{periodEtikett(m).split(' ')[0]}</div>
              <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{s.antal === 0 ? 'Inga rundor' : metaRad(s)}</div>
            </div>
            <div style={{ textAlign: 'right', ...TNUM }}>
              <div style={{ ...TYP.listtitel, color: FARG.text }}>{s.km.toLocaleString('sv-SE')} km</div>
              {s.km > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>Övrig {Math.round((100 * s.kmOvrig) / s.km)} %</div>}
            </div>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
          </button>
        ))}
      </section>
      <Anmarkningar s={summa} />
    </div>
  );
}
