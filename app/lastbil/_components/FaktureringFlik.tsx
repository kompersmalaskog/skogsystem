'use client';

import { useCallback, useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import GodkandKvitto from './GodkandKvitto';
import FlyttSheet from './FlyttSheet';
import { fmtDatum } from './nu';
import { periodKort, type Period } from './period';
import { kmAndringsText, sorteraUnderlag, underlagStatus, type UnderlagRad, type UnderlagStatus } from './fakturerbart';
import { angraGodkannande, godkannFlytt, sparaTraillertid } from './godkann';
import TidArk from './TidArk';
import { fakturerasPaTid, useTraillertid, type TidLage } from './useTraillertid';
import { fmtTid, minFranTimmar, timmarForFaktura, type TidForslag } from '@/lib/flytt/traillertid';
import type { FakturerbartStatus } from './useFakturerbart';
import { useUnderlagNamn, type Namnkartor } from './useUnderlagNamn';

/** Grupperna är FRÅGOR (Martin 2026-10-24: så att ett barn förstår) — rubriken säger vad listan under svarar på. */
const GRUPP: { id: UnderlagStatus; rubrik: string }[] = [
  { id: 'att_godkanna', rubrik: 'Vad ska du godkänna?' },
  { id: 'hos', rubrik: 'Vad väntar på faktura?' },
  { id: 'fakturerad', rubrik: 'Vad är fakturerat?' },
  { id: 'struken', rubrik: 'Vad är struket?' },
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

const platsNamn = (o: string | null, p: string | null, n: Namnkartor) => (o && n.objekt.get(o)) || (p && n.plats.get(p)) || null;

/** Rad 1 — vad som hände, i ord: "Elefant 26 till Bågskyttebanan RP J-Hus- 25" (som rundraden i Körningar). */
const vadText = (r: UnderlagRad, n: Namnkartor) => `${maskinNamn(r, n)} till ${platsNamn(r.till_objekt_id, r.till_plats_id, n) ?? 'okänd plats'}`;

/** Rad 2 — när, varifrån och åt vem: "mån 12 okt · från Östra-Hoka 1:7 A-C -25 · Vida". */
function narText(r: UnderlagRad, n: Namnkartor): string {
  const fran = platsNamn(r.fran_objekt_id, r.fran_plats_id, n);
  return [r.datum ? fmtDatum(r.datum) : 'datum saknas i datan', fran ? `från ${fran}` : 'från okänd plats', r.kund ?? 'kund saknas'].join(' · ');
}

/** "Fakturerad tis 6 okt", "Struken tis 6 okt · dubblett". */
function stampel(r: UnderlagRad, st: UnderlagStatus): { text: string; farg: string } | null {
  if (st === 'fakturerad') return { text: `Fakturerad${r.fakturerad_tid ? ' ' + fmtDatum(r.fakturerad_tid) : ''}`, farg: FARG.gron };
  if (st === 'struken') return { text: `Struken${r.struken_tid ? ' ' + fmtDatum(r.struken_tid) : ''}${r.struken_anledning ? ' · ' + r.struken_anledning : ''}`, farg: FARG.rod };
  return null;
}

/** Raden sparad tid i hela minuter, eller null. */
const sparadMin = (r: UnderlagRad): number | null => (r.traillertimmar != null && Number(r.traillertimmar) > 0 ? minFranTimmar(Number(r.traillertimmar)) : null);

/** Förslaget för raden: undefined = läses, null = läsfel. */
const forslagFor = (r: UnderlagRad, t: TidLage): TidForslag | null | undefined =>
  t.lage === 'klar' ? t.forslag.get(r.id) : t.lage === 'fel' ? null : undefined;

/**
 * Tidraden för en flytt över 3 mil, i ord: "Tid 3 h 49 min" (sparad), "Tid 3 h 49 min · sparas när du godkänner"
 * (att godkänna), eller orange när tiden saknas ("Tid saknas · förslag 3 h 49 min", "Tid saknas · rundan pågår fortfarande").
 */
function tidText(r: UnderlagRad, st: UnderlagStatus, f: TidForslag | null | undefined): { text: string; farg: string; varning: string | null } {
  const sparad = sparadMin(r);
  if (sparad != null) return { text: `Tid ${fmtTid(sparad)}`, farg: FARG.text2, varning: null };
  if (f === undefined) return { text: 'Tid: läser …', farg: FARG.text2, varning: null };
  if (f === null) return { text: 'Tid saknas · kunde inte läsa rundan', farg: FARG.orange, varning: null };
  if (f.lage === 'saknas') return { text: `Tid saknas · ${f.orsak.toLowerCase()}`, farg: FARG.orange, varning: null };
  if (st === 'att_godkanna') return { text: `Tid ${fmtTid(f.min)} · sparas när du godkänner`, farg: FARG.text2, varning: f.varning };
  return { text: `Tid saknas · förslag ${fmtTid(f.min)}`, farg: FARG.orange, varning: f.varning };
}

const kmText = (r: UnderlagRad) => (r.km != null ? `${Math.round(r.km).toLocaleString('sv-SE')} km` : '–');

/** Raden i ord. Kundens ändringsspår ("tillagd, saknades i datan") står i arket, inte här — raden säger bara vem som betalar. */
function Uppgifter({ r, n, st }: { r: UnderlagRad; n: Namnkartor; st: UnderlagStatus }) {
  const stamp = stampel(r, st);
  return (
    <>
      <div data-underlag-vad style={{ ...TYP.listtitel, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vadText(r, n)}</div>
      <div data-underlag-nar style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{narText(r, n)}</div>
      {stamp && <div style={{ ...TYP.meta, color: stamp.farg }}>{stamp.text}</div>}
    </>
  );
}

function KvittoRad({ r, st, n, sista, sparar, tid, onGodkann, onOppna, onOppnaTid }: {
  r: UnderlagRad; st: UnderlagStatus; n: Namnkartor; sista: boolean; sparar: boolean;
  /** Tidraden (bara flyttar över 3 mil), annars null. */
  tid: { text: string; farg: string; varning: string | null } | null;
  onGodkann: (r: UnderlagRad) => void; onOppna: (r: UnderlagRad) => void; onOppnaTid: (r: UnderlagRad) => void;
}) {
  const struken = st === 'struken';
  const attGodkanna = st === 'att_godkanna';
  const kmText2 = kmAndringsText(r);
  return (
    <div data-underlag={r.id} data-status={st}
      style={{ ...RAD, alignItems: 'flex-start', borderBottom: sista ? 'none' : RAD.borderBottom, opacity: struken ? 0.6 : 1 }}>
      {/* Raden öppnar sheeten "Flytten": rätta, eller bara läsa när flytten är låst (godkänd, fakturerad, struken). */}
      <div style={{ flex: 1, minWidth: 0 }}>
      <button type="button" onClick={() => onOppna(r)} aria-label={`Visa flytten ${maskinNamn(r, n)}`}
        style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
        <Uppgifter r={r} n={n} st={st} />
      </button>
      {/* Tiden (flytt över 3 mil) är en egen rad med eget tryck: den öppnar "Tid att fakturera", inte flyttens ark. */}
      {tid && (
        <button type="button" data-tid={r.id} onClick={() => onOppnaTid(r)} aria-label={`Tid att fakturera för ${maskinNamn(r, n)}`}
          style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, width: '100%', minHeight: TRAFFYTA.min, padding: 0, background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ ...TYP.meta, ...TNUM, color: tid.farg, display: 'block' }}>{tid.text}</span>
            {tid.varning && <span data-tid-varning style={{ ...TYP.meta, color: FARG.orange, display: 'block' }}>{tid.varning}</span>}
          </span>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>
        </button>
      )}
      </div>
      <div style={{ textAlign: 'right', ...TNUM, minWidth: TRAFFYTA.min, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: AVSTAND.xs }}>
        <div style={{ ...TYP.listtitel, color: struken ? FARG.text2 : FARG.text, textDecoration: struken ? 'line-through' : 'none' }}>{kmText(r)}</div>
        {r.km == null && !kmText2 && <div style={{ ...TYP.meta, color: FARG.text2 }}>km saknas i datan</div>}
        {kmText2 && <div style={{ ...TYP.meta, color: FARG.orange }}>{kmText2}</div>}
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
 * Raderna kommer ur samma läsning som remsan (`useFakturerbart`).
 *
 * Tryck på en rad → sheeten "Flytten" (`FlyttSheet`): maskin, från, till och typ rättas via databasfunktionen
 * `ratta_flytt`, sträcka och kund mot underlaget, flytten stryks via `stryk_flytt` — alltid med en anledning.
 * Godkänn-trycket på raden är oförändrat. Ett rättat värde märks "ändrad från 47" (originalet bevaras av
 * databasen) så det aldrig ser ut som en mätning. En godkänd eller fakturerad flytt är låst i sheeten.
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
  const [kvitto, setKvitto] = useState<{ id: string; text: string; angra?: boolean; tidSparad?: boolean } | null>(null);
  const [oppnad, setOppnad] = useState<UnderlagRad | null>(null);
  const [tidOppen, setTidOppen] = useState<UnderlagRad | null>(null);
  const tid = useTraillertid(rader);

  const grupper = useMemo(() => {
    const sorterat = sorteraUnderlag(rader ?? []);
    return GRUPP.map(g => ({ ...g, rader: sorterat.filter(r => underlagStatus(r) === g.id) })).filter(g => g.rader.length > 0);
  }, [rader]);

  const stangKvitto = useCallback(() => setKvitto(null), []);

  async function godkann(r: UnderlagRad, n: Namnkartor) {
    if (sparar) return;
    setSparar(r.id); setFel(null);
    // En flytt över 3 mil utan sparad tid: tiden som står på raden (förslaget) sparas med samma tryck.
    const f = fakturerasPaTid(r) && sparadMin(r) == null ? forslagFor(r, tid.lage) : undefined;
    const tidMin = f && f.lage === 'ok' ? f.min : null;
    const svar = await godkannFlytt(r.id, namn, new Date(), tidMin != null ? timmarForFaktura(tidMin) : undefined);
    setSparar(null);
    if (!svar.ok) {
      setFel(`Kunde inte godkänna flytten: ${svar.fel}`);
      if (svar.utdaterad) onAndrad();
      return;
    }
    setKvitto({ id: r.id, text: `Godkänd · ${maskinNamn(r, n)}${tidMin != null ? ` · ${fmtTid(tidMin)}` : ''}`, angra: true, tidSparad: tidMin != null });
    onAndrad();
  }

  async function angra() {
    if (!kvitto) return;
    const id = kvitto.id, rensaTid = !!kvitto.tidSparad;
    setKvitto(null); setFel(null);
    const svar = await angraGodkannande(id, rensaTid);
    if (!svar.ok) setFel(`Kunde inte ångra godkännandet: ${svar.fel}`);
    onAndrad();
  }

  if (status.lage === 'laddar') return <Status text="Läser fakturaunderlaget …" />;
  if (status.lage === 'fel' || !rader) return <Fel text="Kunde inte läsa fakturaunderlaget just nu." onForsokIgen={onForsokIgen} />;
  if (namnLage.lage.lage === 'laddar') return <Status text="Läser namn …" />;
  if (namnLage.lage.lage === 'fel') return <Fel text="Kunde inte läsa maskin- och platsnamnen just nu." onForsokIgen={namnLage.forsokIgen} />;
  const n = namnLage.lage.namn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>

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
          <h3 style={{ ...TYP.micro, color: g.id === 'att_godkanna' ? FARG.orange : FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>{g.rubrik}</h3>
          <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
            {g.rader.map((r, i) => (
              <KvittoRad key={r.id} r={r} st={g.id} n={n} sista={i === g.rader.length - 1}
                sparar={sparar === r.id} onGodkann={rad => godkann(rad, n)}
                tid={fakturerasPaTid(r) ? tidText(r, g.id, forslagFor(r, tid.lage)) : null}
                onOppna={rad => setOppnad(rad)} onOppnaTid={rad => setTidOppen(rad)} />
            ))}
          </div>
        </section>
      ))}

      {oppnad && (
        <FlyttSheet key={oppnad.id} flyttId={oppnad.flytt_id} underlagId={oppnad.id} namn={namn} onStang={() => setOppnad(null)}
          onKlar={text => { setOppnad(null); setKvitto({ id: oppnad.id, text, }); }}
          onDelvis={melding => { setOppnad(null); setFel(melding); }}
          onAndrad={onAndrad} />
      )}
      {tidOppen && (
        <TidArk key={tidOppen.id} maskin={maskinNamn(tidOppen, n)} forslag={forslagFor(tidOppen, tid.lage) ?? null}
          sparadMin={sparadMin(tidOppen)} last={underlagStatus(tidOppen) === 'fakturerad'}
          onStang={() => setTidOppen(null)}
          onSpara={async min => {
            const svar = await sparaTraillertid(tidOppen.id, timmarForFaktura(min));
            if (svar.ok) { setTidOppen(null); setKvitto({ id: tidOppen.id, text: `Tiden sparad · ${maskinNamn(tidOppen, n)} · ${fmtTid(min)}` }); onAndrad(); }
            else if (svar.utdaterad) onAndrad();
            return svar;
          }} />
      )}
      {kvitto && <GodkandKvitto key={`${kvitto.id}:${kvitto.text}`} text={kvitto.text} onAngra={kvitto.angra ? angra : undefined} onKlar={stangKvitto} />}
    </div>
  );
}
