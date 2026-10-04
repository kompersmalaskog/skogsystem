'use client';
// Objekt-arket för en GROT-trakt i /oversikt-v2 (tryck på en rad i GROT-listan; kartan har då flugit dit).
// Samma fem rader som v2:s vanliga objekt-ark — Åtgärd · Volym · Hänsyn · Avstånd · Väntat — med GROT-innehåll,
// plus "Just nu" när en skotare står på det länkade risjobbet, och "Lägg i kö för …". Tillbaka-pilen går till
// GROT-listan igen.
//
// Allt arket visar är sant eller '–': hänsyn kommer ur planeringens markeringar för just det objektet (okänd när
// trakten saknar objekt i planeringen), avstånd är ORS-vägavstånd från skotarna som får köra objektet (aldrig
// fågelväg), volymen är traktens skördade volym och GROT-mängden står som schablon, aldrig som mätt.
//
// Planeringens markvillkor (objekt.barighet — dålig bärighet) visas i orange i Väntat-raden när det är en begränsning;
// det sätts i planeringen och läses bara här. Trakter utan objekt i planeringen har inget att läsa → inget visas.
//
// Längst ner, bara för förman/admin (onSpara skickas in): sektionen "Markägaren" där bortkört-senast-datumet sätts
// (GrotMarkagaren). Utan onSpara — förare — finns den inte. Datumet bor på dim_objekt, så det går att sätta även för de
// trakter som saknar objekt-rad i planeringen.

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, INAKTIV, TYP, TNUM } from '@/lib/design/tokens';
import { uppskattaGrotM3fub } from '@/lib/grot';
import { typLabel } from '@/lib/objekt/typ';
import { classifyMarkering, markeringSub, prettifySub, SUB_LABEL } from '../oversikt/markeringar';
import type { MaskinKoItem } from '../oversikt/oversikt-types';
import { hamtaVagKm } from '@/lib/grotvy/avstand';
import { arealText, FORSENAD_TEXT, grotSchablonText, kmText, kortDatum, markBegransningText, SAKNAR_OBJEKT_TEXT, senastText, skordatText } from '@/lib/grotvy/format';
import { arForsenad, rollMatcharTyp, type GrotRad, type GrotSkrivning, type Koord } from '@/lib/grotvy/lista';
import { Grabber, KNAPP, KNAPP_LITEN, SheetBas } from './ark-delar';
import GrotMarkagaren from './GrotMarkagaren';

export interface ArkSkotare { id: string; namn: string; roll: string | null; koordinat: Koord | null }
export interface ArkKo { post: MaskinKoItem; maskinNamn: string; plats: number }
/** Planeringens fara/hänsyn-markeringar för objektet. */
type Hansyn = { faror: string[]; hansyn: string[] } | 'laddar' | 'fel';

const SvgTillbaka = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

export default function GrotObjektArk({ rad, idag, skotare, ko, onLaggIKo, onTaBortKo, onSpara, onTillbaka, onClose }: {
  rad: GrotRad;
  idag: string;
  /** Aktiva skotare med läge; arket väljer själv de som får köra objektet enligt skotar_roll. */
  skotare: ArkSkotare[];
  ko: ArkKo | null;
  onLaggIKo: (maskinId: string, objektId: string) => Promise<string | null>;
  onTaBortKo: (koId: string) => Promise<string | null>;
  /** Verifierad sparning av markägarens uppgifter (null = landade, annars felmeddelande). Saknas för förare → ingen sektion. */
  onSpara?: (patch: GrotSkrivning) => Promise<string | null>;
  onTillbaka: () => void;
  onClose: () => void;
}) {
  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);

  const [hansyn, setHansyn] = useState<Hansyn>('laddar');
  const [avstand, setAvstand] = useState<Record<string, number | null>>({});
  const [arbetar, setArbetar] = useState(false);
  const [meddelande, setMeddelande] = useState<string | null>(null);

  const objekt = rad.objekt;
  const eligible = skotare.filter((s) => rollMatcharTyp(s.roll, rad.typ));
  // Nyckel för avståndsberäkningen: vilka skotare OCH var de står — positionerna kan komma efter att arket öppnats.
  const eligibleNyckel = eligible.map((s) => `${s.id}@${s.koordinat?.lat ?? ''},${s.koordinat?.lng ?? ''}`).join('|');

  // Esc stänger (dator). Pekskärm: grabber, eller tryck på kartan.
  useEffect(() => {
    const vid = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', vid);
    return () => window.removeEventListener('keydown', vid);
  }, [onClose]);

  // Hänsyn: planeringens markeringar för DETTA objekt (planering_markeringar.objekt_id = objekt.id), fara först, annars
  // hänsyn — samma klassning som v2 (delad i oversikt/markeringar.ts). Läses per objekt och bara de fyra typnycklarna
  // (JSON-sökväg, inte hela geometrin) så svaret är litet och snabbt, och ett läsfel syns som "kunde inte läsas" i stället
  // för att tolkas som "ingen hänsyn".
  useEffect(() => {
    setHansyn('laddar');
    if (!objekt) return;
    (async () => {
      const faror: string[] = []; const hansynLista: string[] = [];
      for (let fran = 0; ; fran += 500) {
        const { data, error } = await supabase.from('planering_markeringar')
          .select('id, t:data->>type, z:data->>zoneType, l:data->>lineType, a:data->>arrowType')
          .eq('objekt_id', objekt.id).order('id').range(fran, fran + 499);
        if (error) { if (levande.current) setHansyn('fel'); return; }
        for (const m of (data || []) as { t: string | null; z: string | null; l: string | null; a: string | null }[]) {
          const markering = { type: m.t, zoneType: m.z, lineType: m.l, arrowType: m.a };
          const niva = classifyMarkering(markering);
          if (niva !== 'fara' && niva !== 'hansyn') continue;
          const sub = markeringSub(markering);
          (niva === 'fara' ? faror : hansynLista).push(sub ? (SUB_LABEL[sub] || prettifySub(sub)) : 'Markering');
        }
        if (!data || data.length < 500) break;
      }
      if (levande.current) setHansyn({ faror, hansyn: hansynLista });
    })();
  }, [objekt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Avstånd från varje skotare som får köra objektet — ORS när arket öppnas, '–' tills det är känt.
  useEffect(() => {
    setAvstand({});
    const till = rad.koordinat;
    if (!till) return;
    eligible.forEach(async (s) => {
      if (!s.koordinat) return;
      const km = await hamtaVagKm(s.koordinat, till);
      if (levande.current) setAvstand((prev) => ({ ...prev, [s.id]: km }));
    });
  }, [rad.id, eligibleNyckel]); // eslint-disable-line react-hooks/exhaustive-deps

  const rubrikRad = (etikett: string, varde: React.ReactNode) => (<><div style={{ color: FARG.text2 }}>{etikett}</div><div>{varde}</div></>);

  const atgard = rad.atgard || (rad.typ ? typLabel(rad.typ) : '–');
  const areal = arealText(rad.arealHa);
  const grot = uppskattaGrotM3fub(rad.skordatM3);
  const staarNamn = rad.staarHar ? (skotare.find((s) => s.id === rad.staarHar!.maskinId)?.namn ?? rad.staarHar.maskinId) : null;
  const hansynVarde = (): React.ReactNode => {
    if (!objekt) return <span style={{ color: FARG.text2 }}>okänd</span>; // inget objekt i planeringen → inga markeringar att läsa
    if (hansyn === 'laddar') return <span style={{ color: FARG.text2 }}>–</span>;
    if (hansyn === 'fel') return <span style={{ color: FARG.text2 }}>kunde inte läsas</span>;
    const forst = hansyn.faror[0] ?? hansyn.hansyn[0];
    if (!forst) return <span style={{ color: FARG.text2 }}>ingen</span>;
    const fler = hansyn.faror.length + hansyn.hansyn.length - 1;
    return <span style={{ color: hansyn.faror.length ? FARG.rod : FARG.orange }}>{forst}{fler > 0 ? ` +${fler}` : ''}</span>;
  };
  // En siffra per skotare som får köra objektet: "11 km från Wisent · – km från Elefant 26". '–' tills ORS svarat.
  const avstText = eligible.filter((s) => s.koordinat && rad.koordinat)
    .map((s) => `${avstand[s.id] != null ? kmText(avstand[s.id] as number) : '–'} km från ${s.namn}`).join(' · ') || '–';

  async function lagg(maskinId: string) {
    if (!objekt || arbetar) return;
    setArbetar(true); setMeddelande(null);
    const fel = await onLaggIKo(maskinId, objekt.id);
    if (levande.current) { setArbetar(false); setMeddelande(fel); }
  }
  async function taBort() {
    if (!ko || arbetar) return;
    setArbetar(true); setMeddelande(null);
    const fel = await onTaBortKo(ko.post.id);
    if (levande.current) { setArbetar(false); setMeddelande(fel); }
  }

  const kanKoa = !!objekt && !arbetar;
  const status = ko ? 'i kö' : 'GROT väntar';

  return (
    <div className="sheet-upp" role="dialog" aria-label={rad.namn} style={{ ...SheetBas, maxHeight: '62%', overflowY: 'auto' }}>
      <Grabber onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
        <button onClick={onTillbaka} aria-label="Tillbaka till GROT-listan"
          style={{ width: 44, height: 44, minWidth: 44, marginLeft: -AVSTAND.m, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: FARG.text2, cursor: 'pointer' }}>
          <SvgTillbaka />
        </button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
          {objekt
            ? <a href={`/planering?valt=${objekt.id}`} style={{ ...TYP.rubrik, color: FARG.text, textDecoration: 'none', minWidth: 0 }}>{rad.namn} <span style={{ ...TYP.meta, color: FARG.text2 }}>›</span></a>
            : <div style={{ ...TYP.rubrik, minWidth: 0 }}>{rad.namn}</div>}
          <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{status}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text }}>
        {rubrikRad('Åtgärd', `${atgard}${areal ? ` · ${areal}` : ''}`)}
        {rubrikRad('Volym', (
          <>
            <div style={TNUM}>{skordatText(rad.skordatM3)}</div>
            {grot != null && <div style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{grotSchablonText(grot)}</div>}
          </>
        ))}
        {rubrikRad('Hänsyn', hansynVarde())}
        {rubrikRad('Avstånd', <span style={{ color: FARG.text2 }}>{avstText}</span>)}
        {rubrikRad('Väntat', (
          <>
            <div style={{ color: FARG.text2 }}>{rad.avverkat ? `sedan ${kortDatum(rad.avverkat, idag)} · ${rad.dagar} dgr` : '–'}</div>
            {rad.senast && (
              <div style={{ ...TYP.meta, color: FARG.orange }}>
                {senastText(rad.senast, idag)}
                {arForsenad(rad) && <span style={{ color: FARG.rod }}> · {FORSENAD_TEXT}</span>}
              </div>
            )}
            {markBegransningText(rad.barighet) && <div style={{ ...TYP.meta, color: FARG.orange }}>{markBegransningText(rad.barighet)}</div>}
          </>
        ))}
        {staarNamn && rubrikRad('Just nu', `${staarNamn} står här`)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {ko && <div style={{ ...TYP.meta, color: FARG.text2 }}>I kö för {ko.maskinNamn} · {ko.plats}:a</div>}
        {!objekt ? (
          <>
            <button disabled style={{ ...KNAPP, ...INAKTIV }}>Lägg i kö</button>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{SAKNAR_OBJEKT_TEXT}</div>
          </>
        ) : ko ? (
          <button onClick={taBort} disabled={!kanKoa} style={{ ...KNAPP_LITEN, color: FARG.rod, ...(kanKoa ? null : INAKTIV) }}>Ta bort ur kön</button>
        ) : eligible.length === 0 ? (
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Ingen skotare passar den här åtgärden.</div>
        ) : eligible.length === 1 ? (
          <button onClick={() => lagg(eligible[0].id)} disabled={!kanKoa} style={{ ...KNAPP, ...(kanKoa ? null : INAKTIV) }}>Lägg i kö för {eligible[0].namn}</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <div style={{ ...TYP.micro, color: FARG.text2 }}>Lägg i kö för</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
              {eligible.map((s) => (
                <button key={s.id} onClick={() => lagg(s.id)} disabled={!kanKoa} style={{ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px`, ...(kanKoa ? null : INAKTIV) }}>+ {s.namn}</button>
              ))}
            </div>
          </div>
        )}
        {meddelande && <div style={{ ...TYP.meta, color: FARG.orange }}>{meddelande}</div>}
      </div>

      {onSpara && <GrotMarkagaren rad={rad} onSpara={onSpara} />}
    </div>
  );
}
