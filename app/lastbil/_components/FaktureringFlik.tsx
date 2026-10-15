'use client';

import { useMemo } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { fmtDatum } from './nu';
import { periodKort, type Period } from './period';
import { sorteraUnderlag, underlagStatus, type UnderlagRad, type UnderlagStatus } from './fakturerbart';
import type { FakturerbartStatus } from './useFakturerbart';
import { useUnderlagNamn, type Namnkartor } from './useUnderlagNamn';

const GRUPP: { id: UnderlagStatus; rubrik: string }[] = [
  { id: 'hos', rubrik: 'Hos faktureringen' },
  { id: 'fakturerad', rubrik: 'Fakturerade' },
  { id: 'struken', rubrik: 'Strukna' },
];

function Status({ text, alert }: { text: string; alert?: boolean }) {
  return <p role={alert ? 'alert' : 'status'} style={{ ...TYP.text, color: alert ? FARG.rod : FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>{text}</p>;
}

function Fel({ text, onForsokIgen }: { text: string; onForsokIgen: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
      <Status text={text} alert />
      <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  );
}

/** Raden under maskinnamnet: var den flyttades, eller att platsen saknas — aldrig tyst tomt. */
function strackaText(r: UnderlagRad, n: Namnkartor): string {
  const plats = (o: string | null, p: string | null) => (o && n.objekt.get(o)) || (p && n.plats.get(p)) || null;
  const fran = plats(r.fran_objekt_id, r.fran_plats_id), till = plats(r.till_objekt_id, r.till_plats_id);
  return `${fran ?? 'okänd plats'} → ${till ?? 'okänd plats'}`;
}

/** "Fakturerad tis 6 okt", "Struken tis 6 okt · dubblett". */
function stampel(r: UnderlagRad, st: UnderlagStatus): { text: string; farg: string } | null {
  if (st === 'fakturerad') return { text: `Fakturerad${r.fakturerad_tid ? ' ' + fmtDatum(r.fakturerad_tid) : ''}`, farg: FARG.gron };
  if (st === 'struken') return { text: `Struken${r.struken_tid ? ' ' + fmtDatum(r.struken_tid) : ''}${r.struken_anledning ? ' · ' + r.struken_anledning : ''}`, farg: FARG.rod };
  return null;
}

function KvittoRad({ r, st, n, sista }: { r: UnderlagRad; st: UnderlagStatus; n: Namnkartor; sista: boolean }) {
  const stamp = stampel(r, st);
  const struken = st === 'struken';
  return (
    <div data-underlag={r.id} style={{ ...RAD, alignItems: 'flex-start', borderBottom: sista ? 'none' : RAD.borderBottom, opacity: struken ? 0.6 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{r.maskin ? (n.maskin.get(r.maskin) ?? r.maskin) : 'Maskin saknas i datan'}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{strackaText(r, n)}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>
          {r.datum ? fmtDatum(r.datum) : 'datum saknas i datan'}{r.kund ? ` · Kund: ${r.kund}` : ''}
        </div>
        {stamp && <div style={{ ...TYP.meta, color: stamp.farg }}>{stamp.text}</div>}
      </div>
      <div style={{ textAlign: 'right', ...TNUM, minWidth: TRAFFYTA.min }}>
        <div style={{ ...TYP.listtitel, color: struken ? FARG.text2 : FARG.text, textDecoration: struken ? 'line-through' : 'none' }}>
          {r.km != null ? `${Math.round(r.km).toLocaleString('sv-SE')} km` : '–'}
        </div>
        {r.km == null && <div style={{ ...TYP.meta, color: FARG.text2 }}>km saknas i datan</div>}
      </div>
    </div>
  );
}

/**
 * Fakturering — "vad kan faktureras?" (bara admin). Kvittot flyttat hit från Flyttloggen: en rad per
 * fakturerbar flytt, gruppad efter var den står (hos faktureringen / fakturerad / struken). Kvittot
 * speglar bara status — handlingen (redigera, stryka) ligger i faktureringen, inte här.
 *
 * Summan står INTE här: den ligger stilla i remsan i rubriken (pengatalet) och är samma tal på alla
 * flikar. Raderna kommer ur samma läsning som remsan (`useFakturerbart`), så de kan aldrig skilja sig.
 */
export default function FaktureringFlik({ period, status, onForsokIgen }: { period: Period; status: FakturerbartStatus; onForsokIgen: () => void }) {
  const rader = status.lage === 'klar' ? status.rader : null;
  const namn = useUnderlagNamn(rader, status.lage === 'klar');
  const grupper = useMemo(() => {
    const sorterat = sorteraUnderlag(rader ?? []);
    return GRUPP.map(g => ({ ...g, rader: sorterat.filter(r => underlagStatus(r) === g.id) })).filter(g => g.rader.length > 0);
  }, [rader]);

  if (status.lage === 'laddar') return <Status text="Läser fakturaunderlaget …" />;
  if (status.lage === 'fel' || !rader) return <Fel text="Kunde inte läsa fakturaunderlaget just nu." onForsokIgen={onForsokIgen} />;
  if (namn.lage.lage === 'laddar') return <Status text="Läser namn …" />;
  if (namn.lage.lage === 'fel') return <Fel text="Kunde inte läsa maskin- och platsnamnen just nu." onForsokIgen={namn.forsokIgen} />;
  const n = namn.lage.namn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>bolt</span>
        Går iväg automatiskt när en flytt avslutas fakturerbar — redigera eller stryk i faktureringen.
      </p>

      {grupper.length === 0 ? (
        <section style={KORT} aria-label="Inga flyttar">
          <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>Inga fakturerbara flyttar i {periodKort(period)}.</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
            En flytt hamnar här när den avslutats som fakturerbar (minst 3 mil). Underlaget lästes utan fel.
          </p>
        </section>
      ) : grupper.map(g => (
        <section key={g.id} aria-label={g.rubrik}>
          <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>{g.rubrik} · {g.rader.length}</div>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {g.rader.map((r, i) => <KvittoRad key={r.id} r={r} st={g.id} n={n} sista={i === g.rader.length - 1} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
