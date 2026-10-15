'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import RundaRad from './RundaRad';
import { laddaNerCsv } from './csv';
import { manaderIAr, manadForStart, periodEtikett, periodKort, periodTillText, type Period } from './period';
import { fmtLPerMil, perVecka, rundorTillCsv, summera, type Runda, type Summa } from './rundor';
import type { RundorLage } from './useRundor';

type Filter = 'alla' | 'flytt' | 'ovrig';

function Status({ text, alert }: { text: string; alert?: boolean }) {
  return <p role={alert ? 'alert' : 'status'} style={{ ...TYP.text, color: alert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>{text}</p>;
}

const litTxt = (s: Summa) => (s.liter != null ? `${s.liter.toLocaleString('sv-SE')} l` : 'diesel saknas i datan');
const metaRad = (s: Summa) =>
  [`${s.antal} ${s.antal === 1 ? 'runda' : 'rundor'}`, litTxt(s), fmtLPerMil(s.lPerMil) ? `${fmtLPerMil(s.lPerMil)} l/mil` : null].filter(Boolean).join(' · ');

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
 * Körningar — "vad har bilen gjort och vad drog det?". Två block i viloläge: månadskortet (ETT tal: körda km,
 * delat i Flyttar och Övrig körning som är knappar) och rundlistan. Detaljen ligger i arket. År visar
 * månaderna som rader. Alla rundor räknas på sin svenska startdag.
 */
export default function KorningarFlik({ period, lage, onForsokIgen, onOppna, onValjManad }: {
  period: Period; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void; onValjManad: (p: Period) => void;
}) {
  // Filtret hör till perioden: byter man period börjar man om (ett kvarglömt filter vore ett falskt tomläge).
  return (
    <>
      <Inre key={periodTillText(period)} period={period} lage={lage} onForsokIgen={onForsokIgen} onOppna={onOppna} onValjManad={onValjManad} />
      <FlyttplatserLank />
    </>
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

function Inre({ period, lage, onForsokIgen, onOppna, onValjManad }: {
  period: Period; lage: RundorLage; onForsokIgen: () => void; onOppna: (r: Runda) => void; onValjManad: (p: Period) => void;
}) {
  const [filter, setFilter] = useState<Filter>('alla');
  const rundor = lage.lage === 'klar' ? lage.rundor : null;
  const summa = useMemo(() => (rundor ? summera(rundor) : null), [rundor]);
  const synliga = useMemo(() => (rundor ?? []).filter(r => filter === 'alla' || (filter === 'flytt' ? r.flytt : !r.flytt)), [rundor, filter]);
  const veckor = useMemo(() => perVecka(synliga), [synliga]);

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

  const filterKnapp = (id: Exclude<Filter, 'alla'>, namn: string, antal: number, km: number) => (
    <button type="button" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? 'alla' : id)}
      style={{ ...KNAPP.tertiar, width: '100%', justifyContent: 'space-between', gap: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.s}px`, margin: `0 -${AVSTAND.s}px`, borderRadius: 10, background: filter === id ? FARG.fyllning : 'none', color: FARG.text, font: 'inherit', ...TYP.text, boxSizing: 'content-box' }}>
      <span style={{ flex: 1, textAlign: 'left' }}>{namn} · {antal} {antal === 1 ? 'runda' : 'rundor'}</span>
      <span style={{ ...TYP.listtitel, ...TNUM }}>{km.toLocaleString('sv-SE')} km</span>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      {/* Block 1: månadskortet */}
      <section style={KORT} aria-label="Månaden">
        <div style={{ ...TYP.micro, color: FARG.text2 }}>Körd i {periodKort(period)}</div>
        <div style={{ ...TYP.tal, color: FARG.text, marginTop: AVSTAND.xs }}>{summa.km.toLocaleString('sv-SE')} km</div>
        <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{metaRad(summa)}</div>
        <div style={{ marginTop: AVSTAND.m, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {filterKnapp('flytt', 'Flyttar', summa.flytt, summa.kmFlytt)}
          {filterKnapp('ovrig', 'Övrig körning', summa.ovrig, summa.kmOvrig)}
          {filter !== 'alla' && <button type="button" onClick={() => setFilter('alla')} style={{ ...KNAPP.lank, ...TYP.meta }}>Visa alla rundor</button>}
        </div>
      </section>

      {/* Block 2: rundorna, en rad var, alla tryckbara */}
      {veckor.length === 0 ? (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
          {rundor.length === 0 ? 'Inga rundor i den här månaden. Körningarna lästes utan fel.' : 'Inga rundor av den typen i månaden.'}
        </p>
      ) : veckor.map(v => (
        <section key={`${v.ar}-${v.vecka}`} aria-label={`Vecka ${v.vecka}`}>
          <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>Vecka {v.vecka}</div>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {v.rundor.map((r, i) => <RundaRad key={r.id} runda={r} sista={i === v.rundor.length - 1} onOppna={onOppna} />)}
          </div>
        </section>
      ))}

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
