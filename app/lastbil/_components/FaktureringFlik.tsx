'use client';

import { useCallback, useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import GodkandKvitto from './GodkandKvitto';
import StrykArk from './StrykArk';
import { fmtDatum } from './nu';
import { periodKort, type Period } from './period';
import { sorteraUnderlag, underlagStatus, type UnderlagRad, type UnderlagStatus } from './fakturerbart';
import { angraGodkannande, godkannFlytt, strykFlytt } from './godkann';
import type { FakturerbartStatus } from './useFakturerbart';
import { useUnderlagNamn, type Namnkartor } from './useUnderlagNamn';

const GRUPP: { id: UnderlagStatus; rubrik: string }[] = [
  { id: 'att_godkanna', rubrik: 'Att godkänna' },
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

const maskinNamn = (r: UnderlagRad, n: Namnkartor) => (r.maskin ? (n.maskin.get(r.maskin) ?? r.maskin) : 'Maskin saknas i datan');

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

const kmText = (r: UnderlagRad) => (r.km != null ? `${Math.round(r.km).toLocaleString('sv-SE')} km` : '–');

function Uppgifter({ r, n, st }: { r: UnderlagRad; n: Namnkartor; st: UnderlagStatus }) {
  const stamp = stampel(r, st);
  return (
    <>
      <div style={{ ...TYP.listtitel, color: FARG.text }}>{maskinNamn(r, n)}</div>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{strackaText(r, n)}</div>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>
        {r.datum ? fmtDatum(r.datum) : 'datum saknas i datan'}{r.kund ? ` · Kund: ${r.kund}` : ''}
      </div>
      {stamp && <div style={{ ...TYP.meta, color: stamp.farg }}>{stamp.text}</div>}
    </>
  );
}

function KvittoRad({ r, st, n, sista, sparar, onGodkann, onOppna }: {
  r: UnderlagRad; st: UnderlagStatus; n: Namnkartor; sista: boolean; sparar: boolean;
  onGodkann: (r: UnderlagRad) => void; onOppna: (r: UnderlagRad) => void;
}) {
  const struken = st === 'struken';
  const attGodkanna = st === 'att_godkanna';
  return (
    <div data-underlag={r.id} data-status={st}
      style={{ ...RAD, alignItems: 'flex-start', borderBottom: sista ? 'none' : RAD.borderBottom, opacity: struken ? 0.6 : 1 }}>
      {/* Raden att godkänna är tryckbar (öppnar Stryk-arket); övriga rader är bara kvitto. */}
      {attGodkanna ? (
        <button type="button" onClick={() => onOppna(r)} aria-label={`Visa flytten ${maskinNamn(r, n)}`}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
          <Uppgifter r={r} n={n} st={st} />
        </button>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}><Uppgifter r={r} n={n} st={st} /></div>
      )}
      <div style={{ textAlign: 'right', ...TNUM, minWidth: TRAFFYTA.min, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: AVSTAND.xs }}>
        <div style={{ ...TYP.listtitel, color: struken ? FARG.text2 : FARG.text, textDecoration: struken ? 'line-through' : 'none' }}>{kmText(r)}</div>
        {r.km == null && <div style={{ ...TYP.meta, color: FARG.text2 }}>km saknas i datan</div>}
        {attGodkanna && (
          <button type="button" onClick={() => onGodkann(r)} disabled={sparar}
            style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px`, ...(sparar ? INAKTIV : {}) }}>
            {sparar ? 'Sparar …' : 'Godkänn'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Fakturering — "vad kan faktureras?" (bara admin), med Arbetsrapportens bekräfta-modell: en flytt är
 * OGODKÄND tills admin trycker Godkänn, och först då går den till faktureringen.
 *
 *   Att godkänna      ogodkända, äldsta först. EN knapp per rad. Tryck på raden → Stryk med anledning.
 *   Hos faktureringen godkända, ännu inte fakturerade
 *   Fakturerade, Strukna
 *
 * Summan står INTE här: den ligger stilla i remsan (pengatalet) och räknar bara godkända flyttar.
 * Raderna kommer ur samma läsning som remsan (`useFakturerbart`). Km och kund redigeras inte här —
 * kvittot speglar flytten som föraren registrerade; stämmer den inte, stryk den med anledning.
 */
export default function FaktureringFlik({ period, status, namn, onForsokIgen, onAndrad }: {
  period: Period; status: FakturerbartStatus;
  /** Den som godkänner (medarbetarens namn) — sparas som godkand_av. */
  namn: string;
  onForsokIgen: () => void;
  /** En skrivning gick igenom (eller var utdaterad): läs om remsan, listan och påminnelsen tyst. */
  onAndrad: () => void;
}) {
  const rader = status.lage === 'klar' ? status.rader : null;
  const namnLage = useUnderlagNamn(rader, status.lage === 'klar');
  const [sparar, setSparar] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [kvitto, setKvitto] = useState<{ id: string; text: string } | null>(null);
  const [stryker, setStryker] = useState<UnderlagRad | null>(null);
  const [strykFel, setStrykFel] = useState<string | null>(null);

  const grupper = useMemo(() => {
    const sorterat = sorteraUnderlag(rader ?? []);
    return GRUPP.map(g => ({ ...g, rader: sorterat.filter(r => underlagStatus(r) === g.id) })).filter(g => g.rader.length > 0);
  }, [rader]);

  const stangKvitto = useCallback(() => setKvitto(null), []);

  async function godkann(r: UnderlagRad, n: Namnkartor) {
    if (sparar) return;
    setSparar(r.id); setFel(null);
    const svar = await godkannFlytt(r.id, namn);
    setSparar(null);
    if (!svar.ok) {
      setFel(`Kunde inte godkänna flytten: ${svar.fel}`);
      if (svar.utdaterad) onAndrad();
      return;
    }
    setKvitto({ id: r.id, text: `Godkänd · ${maskinNamn(r, n)}` });
    onAndrad();
  }

  async function angra() {
    if (!kvitto) return;
    const id = kvitto.id;
    setKvitto(null); setFel(null);
    const svar = await angraGodkannande(id);
    if (!svar.ok) setFel(`Kunde inte ångra godkännandet: ${svar.fel}`);
    onAndrad();
  }

  async function stryk(r: UnderlagRad, anledning: string) {
    setSparar(r.id); setStrykFel(null);
    const svar = await strykFlytt(r.id, namn, anledning);
    setSparar(null);
    if (!svar.ok) {
      setStrykFel(svar.fel);
      if (svar.utdaterad) onAndrad();
      return;
    }
    setStryker(null);
    onAndrad();
  }

  if (status.lage === 'laddar') return <Status text="Läser fakturaunderlaget …" />;
  if (status.lage === 'fel' || !rader) return <Fel text="Kunde inte läsa fakturaunderlaget just nu." onForsokIgen={onForsokIgen} />;
  if (namnLage.lage.lage === 'laddar') return <Status text="Läser namn …" />;
  if (namnLage.lage.lage === 'fel') return <Fel text="Kunde inte läsa maskin- och platsnamnen just nu." onForsokIgen={namnLage.forsokIgen} />;
  const n = namnLage.lage.namn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>bolt</span>
        En flytt som avslutas fakturerbar hamnar under Att godkänna. Godkänn den — då går den till faktureringen.
      </p>

      {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}

      {grupper.length === 0 ? (
        <section style={KORT} aria-label="Inga flyttar">
          <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>Inga fakturerbara flyttar i {periodKort(period)}.</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
            En flytt hamnar här när den avslutats som fakturerbar (minst 3 mil). Underlaget lästes utan fel.
          </p>
        </section>
      ) : grupper.map(g => (
        <section key={g.id} aria-label={g.rubrik}>
          <div style={{ ...TYP.micro, color: g.id === 'att_godkanna' ? FARG.orange : FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>{g.rubrik} · {g.rader.length}</div>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {g.rader.map((r, i) => (
              <KvittoRad key={r.id} r={r} st={g.id} n={n} sista={i === g.rader.length - 1}
                sparar={sparar === r.id} onGodkann={rad => godkann(rad, n)}
                onOppna={rad => { setStrykFel(null); setStryker(rad); }} />
            ))}
          </div>
        </section>
      ))}

      {stryker && (
        <StrykArk rad={stryker} maskin={maskinNamn(stryker, n)} stracka={strackaText(stryker, n)}
          datum={stryker.datum ? fmtDatum(stryker.datum) : 'datum saknas i datan'}
          sparar={sparar === stryker.id} fel={strykFel}
          onStryk={a => stryk(stryker, a)} onStang={() => setStryker(null)} />
      )}
      {kvitto && <GodkandKvitto key={kvitto.id} text={kvitto.text} onAngra={angra} onKlar={stangKvitto} />}
    </div>
  );
}
