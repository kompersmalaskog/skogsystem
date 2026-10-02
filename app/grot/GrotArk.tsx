'use client';
// Ark för ett GROT-objekt (tryck på en rad i /grot). Samma fem rader som objekt-arket i /oversikt-v2:
// Åtgärd · Volym · Hänsyn · Avstånd · Väntat — och under dem "Lägg i kö för …" + "Visa på kartan".
//
// Allt arket visar är sant eller '–': hänsyn läses ur planeringens markeringar för just det objektet
// (okänd när trakten saknar objekt i planeringen), avstånd är ORS-vägavstånd från skotarna som får
// köra objektet (aldrig fågelväg), volymen är traktens skördade volym och GROT-mängden står som
// schablon, aldrig som mätt.

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, INAKTIV, LAYOUT, RADIE, TYP, TNUM, medSafeBotten } from '@/lib/design/tokens';
import { uppskattaGrotM3fub } from '@/lib/grot';
import { typLabel } from '@/lib/objekt/typ';
import { classifyMarkering, markeringSub, prettifySub, SUB_LABEL } from '../oversikt/markeringar';
import type { MaskinKoItem } from '../oversikt/oversikt-types';
import { hamtaVagKm } from '@/lib/grotvy/avstand';
import { arealText, grotSchablonText, kmText, kortDatum, SAKNAR_OBJEKT_TEXT, senastText, skordatText } from '@/lib/grotvy/format';
import { rollMatcharTyp, type GrotRad, type Koord } from '@/lib/grotvy/lista';

export interface ArkSkotare { id: string; namn: string; roll: string | null; koordinat: Koord | null }
export interface ArkKo { post: MaskinKoItem; maskinNamn: string; plats: number }

// Samma ark som i /oversikt-v2 (kanvasen): sheet från botten, kant på knapparna.
const SHEET: React.CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1101,
  display: 'flex', flexDirection: 'column', gap: AVSTAND.m,
  padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}`,
  maxHeight: `calc(100dvh - ${LAYOUT.topbar})`, overflowY: 'auto', boxSizing: 'border-box',
  background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
  boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
};
const KNAPP: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.s, flexGrow: 1, minHeight: 50,
  border: `0.5px solid ${FARG.text3}`, borderRadius: RADIE.knapp, textDecoration: 'none',
  ...TYP.listtitel, color: FARG.text, fontFamily: 'inherit', background: 'transparent', cursor: 'pointer', boxSizing: 'border-box',
};
const KNAPP_LITEN: React.CSSProperties = { ...KNAPP, minHeight: 44, ...TYP.text };

function Grabber({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="Stäng" style={{ display: 'flex', justifyContent: 'center', border: 'none', background: 'none', padding: `${AVSTAND.xs}px 0`, cursor: 'pointer' }}>
      <div style={{ width: 36, height: 5, borderRadius: RADIE.stapel, background: FARG.text3 }} />
    </button>
  );
}

type Hansyn = { faror: string[]; hansyn: string[] } | 'laddar' | 'fel';

export default function GrotArk({ rad, idag, skotare, ko, koStatus, visaKnappar, onLaggIKo, onTaBortKo, onClose }: {
  rad: GrotRad;
  idag: string;
  skotare: ArkSkotare[];
  ko: ArkKo | null;
  /** Kön läses separat; knapparna är avstängda tills den är läst, och felet säger vad som gäller. */
  koStatus: 'laddar' | 'klar' | 'fel';
  /** Falskt för förare (de ser listan och arket men ställer ingenting) och medan rollen laddas. */
  visaKnappar: boolean;
  onLaggIKo: (maskinId: string, objektId: string) => Promise<string | null>;
  onTaBortKo: (koId: string) => Promise<string | null>;
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

  // Esc stänger (dator). Pekskärm: grabber, eller tryck utanför.
  useEffect(() => {
    const vid = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', vid);
    return () => window.removeEventListener('keydown', vid);
  }, [onClose]);

  // Hänsyn: planeringens markeringar för DETTA objekt (planering_markeringar.objekt_id = objekt.id).
  // Fara först, annars hänsyn — samma klassning som v2 (delad i oversikt/markeringar.ts).
  useEffect(() => {
    setHansyn('laddar');
    if (!objekt) return;
    (async () => {
      const faror: string[] = []; const hansynLista: string[] = [];
      let fran = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.from('planering_markeringar').select('objekt_id, typ, data').eq('objekt_id', objekt.id).order('id').range(fran, fran + 999);
        if (error) { if (levande.current) setHansyn('fel'); return; }
        for (const m of data || []) {
          const niva = classifyMarkering(m.data);
          if (niva !== 'fara' && niva !== 'hansyn') continue;
          const sub = markeringSub(m.data);
          const etikett = sub ? (SUB_LABEL[sub] || prettifySub(sub)) : 'Markering';
          (niva === 'fara' ? faror : hansynLista).push(etikett);
        }
        if (!data || data.length < 1000) break;
        fran += 1000;
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
  const dolja = (v: Hansyn): React.ReactNode => {
    if (!objekt) return <span style={{ color: FARG.text2 }}>okänd</span>;
    if (v === 'laddar') return <span style={{ color: FARG.text2 }}>–</span>;
    if (v === 'fel') return <span style={{ color: FARG.text2 }}>kunde inte läsas</span>;
    const forst = v.faror[0] ?? v.hansyn[0];
    if (!forst) return <span style={{ color: FARG.text2 }}>ingen</span>;
    const fler = v.faror.length + v.hansyn.length - 1;
    return <span style={{ color: v.faror.length ? FARG.rod : FARG.orange }}>{forst}{fler > 0 ? ` +${fler}` : ''}</span>;
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

  const kanKoa = !!objekt && koStatus === 'klar' && !arbetar;
  const status = ko ? 'i kö' : 'GROT väntar';

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)' }} />
      <div className="sheet-upp" role="dialog" aria-label={rad.namn} style={SHEET}>
        <Grabber onClose={onClose} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
          {objekt
            ? <a href={`/planering?valt=${objekt.id}`} style={{ ...TYP.rubrik, color: FARG.text, textDecoration: 'none', minWidth: 0 }}>{rad.namn} <span style={{ ...TYP.meta, color: FARG.text2 }}>›</span></a>
            : <div style={{ ...TYP.rubrik, minWidth: 0 }}>{rad.namn}</div>}
          <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{status}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text }}>
          {rubrikRad('Åtgärd', `${atgard}${areal ? ` · ${areal}` : ''}`)}
          {rubrikRad('Volym', (
            <>
              <div style={TNUM}>{skordatText(rad.skordatM3)}</div>
              {grot != null && <div style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{grotSchablonText(grot)}</div>}
            </>
          ))}
          {rubrikRad('Hänsyn', dolja(hansyn))}
          {rubrikRad('Avstånd', <span style={{ color: FARG.text2 }}>{avstText}</span>)}
          {rubrikRad('Väntat', (
            <>
              <div style={{ color: FARG.text2 }}>{rad.avverkat ? `sedan ${kortDatum(rad.avverkat, idag)} · ${rad.dagar} dgr` : '–'}</div>
              {rad.senast && <div style={{ ...TYP.meta, color: FARG.orange }}>{senastText(rad.senast, rad.skal, idag)}</div>}
            </>
          ))}
        </div>

        {visaKnappar && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {ko && (
              <div style={{ ...TYP.meta, color: FARG.text2 }}>I kö för {ko.maskinNamn} · {ko.plats}:a</div>
            )}
            {!objekt ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                  <button disabled style={{ ...KNAPP, ...INAKTIV }}>Lägg i kö</button>
                  <button disabled style={{ ...KNAPP, ...INAKTIV }}>Visa på kartan</button>
                </div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>{SAKNAR_OBJEKT_TEXT}</div>
              </>
            ) : (
              <>
                {ko ? (
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
                <a href={`/oversikt-v2?objekt=${objekt.id}`} style={KNAPP}>Visa på kartan</a>
                {koStatus === 'fel' && <div style={{ ...TYP.meta, color: FARG.orange }}>Kön kunde inte hämtas — ladda om sidan.</div>}
              </>
            )}
            {meddelande && <div style={{ ...TYP.meta, color: FARG.orange }}>{meddelande}</div>}
          </div>
        )}
      </div>
    </>
  );
}
