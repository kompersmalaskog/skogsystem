'use client';
// MIN PLAN — förarens sida i Översikten. Regler och ord: ./plan.ts; sidan (page.tsx) ger kön, faror och Kör dit.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FARG, TYP, AVSTAND, RADIE, KOLUMN, KNAPP } from '@/lib/design/tokens';
import { KommentarVisning } from '@/components/planering/KommentarRuta';
import { forbered, statusOrd, faktaRad, strackaText, type PlanObjekt, type Roll } from './plan';
import { koNamn, type MaskinForslag } from './nasta-v2';
import { POS_NU_TEXT } from './las-fel-banner';
import { VARNING_LADDAR, VARNING_LASFEL, type VarningsSvar } from './markeringar-las';
import { KNAPP_LITEN, SvgRing } from './ark-delar';
import type { OversiktObjekt } from './oversikt-types';

// ══════════════════════════════ MIN PLAN ═════════════════════════════════════
// Förarens sida (Martin 2026-11-05): "du ska från detta objekt till detta, och statusen på det … allt han måste veta för nästa trakt
// så han är förberedd". Ett ärligt A4 i telefonen: NU, NÄSTA (med "Förbered dig" öppet) och SEDAN. Regler och ord: ./plan.ts.
function StatusOrd({ o }: { o: PlanObjekt }) {
  const s = statusOrd(o);
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs, color: s.klar ? FARG.text : FARG.orange }}>
    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RADIE.cirkel, background: s.klar ? FARG.gron : FARG.orange }} />{s.text}
  </span>;
}

/** Det som skrivits på kartan för en trakt (kartkommentar). 'laddar' medan det läses, 'fel' när det inte gick — aldrig tyst tomt. */
type KartText = string[] | 'laddar' | 'fel';

// MIN PLAN — som markägarrapporten (Martin 2026-11-05): körordningen i en lista till vänster, trakten man valt till höger.
//  - under 1100 px: EN sak per skärm — listan, ett tryck öppnar trakten med "‹ Min plan";
//  - från 1100 px: listan som sidokolumn (360 px) och trakten bredvid; trakten delar sina frågor i två kolumner från 640 px egen bredd.
// Trakten maskinen står på är vald tills föraren trycker på en annan; kommer maskinen till en ny trakt hoppar valet dit.
// Vad som syns avgörs av CSS (ingen mätning i JS). Selektorerna har inga citattecken (React escapar dem i <style>).
const MP_SIDOKOLUMN_FRAN_PX = 1100;
const MP_SIDOKOLUMN_BREDD_PX = 360;
const MP_CSS = `
.mp-ram { display: flex; flex-direction: column; min-height: 100%; }
.mp-lista, .mp-trakt { width: 100%; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.mp-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; display: flex; flex-direction: column; gap: ${AVSTAND.l}px; }
.mp-fragor-ram { container-type: inline-size; container-name: mpf; }
.mp-fragor { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${AVSTAND.m}px; }
@container mpf (min-width: ${KOLUMN.smal}px) {
  .mp-fragor { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .mp-hel { grid-column: 1 / -1; }
}
@media (max-width: ${MP_SIDOKOLUMN_FRAN_PX - 1}px) {
  .mp-vy-lista .mp-trakt { display: none; }
  .mp-vy-trakt .mp-lista { display: none; }
}
@media (min-width: ${MP_SIDOKOLUMN_FRAN_PX}px) {
  .mp-ram { flex-direction: row; height: 100%; }
  .mp-lista { width: ${MP_SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje}; overflow-y: auto; }
  .mp-lista .mp-inre { max-width: none; }
  .mp-trakt { flex: 1; min-width: 0; overflow-y: auto; }
  .mp-trakt .mp-inre { max-width: ${KOLUMN.bred}px; }
  .mp-bara-smal { display: none !important; }
}
`;

const mpKort: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: AVSTAND.l, background: FARG.kort, borderRadius: RADIE.kort, minWidth: 0 };

/** En fråga: etiketten OVANFÖR kortet (designregeln "Rubrikplats"), svaret i kortet. */
function Fraga({ rubrik, hel, children }: { rubrik: string; hel?: boolean; children: React.ReactNode }) {
  return (
    <section className={hel ? 'mp-hel' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, minWidth: 0 }}>
      <h3 style={{ ...TYP.micro, color: FARG.text2, margin: 0 }}>{rubrik}</h3>
      <div style={mpKort}>{children}</div>
    </section>
  );
}

/** Kartans kommentarer: en per rad med en linje emellan; en lång text visar tre rader och "Läs mer". */
function KartRader({ texter }: { texter: string[] }) {
  const [oppen, setOppen] = useState<number | null>(null);
  return <div style={{ display: 'flex', flexDirection: 'column' }}>
    {texter.map((t, i) => {
      const lang = t.length > 160 || t.split('\n').length > 3;
      const kort = lang && oppen !== i;
      return (
        <div key={i} style={{ padding: `${AVSTAND.s}px 0`, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(kort ? { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : null) }}>{t}</div>
          {lang && <button type="button" onClick={() => setOppen(oppen === i ? null : i)} style={{ ...KNAPP.tertiar }}>{kort ? 'Läs mer' : 'Visa mindre'}</button>}
        </div>
      );
    })}
  </div>;
}

function Rader({ rader }: { rader: { text: string; varning: boolean }[] }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
    {rader.map((r, i) => <div key={i} style={{ ...TYP.text, color: r.varning ? FARG.orange : FARG.text, overflowWrap: 'anywhere' }}>{r.text}</div>)}
  </div>;
}

/** Allt föraren måste veta om trakten, som frågor. En fråga utan innehåll står inte — utom "Vad är farligt?", som alltid svarar. */
function TraktFragor({ o, roll, warn, kartText }: { o: PlanObjekt; roll: Roll; warn: VarningsSvar; kartText: KartText }) {
  const f = forbered(o, roll, warn);
  const texter = Array.isArray(kartText) ? kartText : [];
  const tanka = f.rader.filter((r) => r.grupp === 'tanka');
  const kora = f.rader.filter((r) => r.grupp === 'kora');
  const agare = f.rader.filter((r) => r.grupp === 'agare');
  const harTanka = !!f.vida || texter.length > 0 || kartText === 'fel' || tanka.length > 0;
  const ingetSkrivet = !harTanka && !kora.length && !agare.length && !f.markagare && !f.dokument.length;
  return (
    <div className="mp-fragor-ram"><div className="mp-fragor">
      <Fraga rubrik="Vad är farligt?" hel>
        {f.farorOlasta && <div role="alert" style={{ ...TYP.text, color: FARG.orange }}>{VARNING_LASFEL}</div>}
        {warn === 'laddar' && <div style={{ ...TYP.text, color: FARG.text2 }}>{VARNING_LADDAR}</div>}
        {/* Åtgärden är det föraren ska göra — den står i läsbar storlek, inte som en fotnot. */}
        {f.faror.map((v, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            <div style={{ ...TYP.listtitel, color: FARG.rod }}>{v.label}</div>
            {v.kommentar && <div style={{ ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{v.kommentar}</div>}
          </div>
        ))}
        {/* Ingen riskbedömning sägs — en tom lista får aldrig läsas som "inga risker". */}
        {!f.riskbedomd && <div style={{ ...TYP.text, color: FARG.orange }}>Riskbedömningen är inte gjord än</div>}
        {f.riskbedomd && !f.faror.length && warn !== 'laddar' && !f.farorOlasta && <div style={{ ...TYP.text, color: FARG.text2 }}>Inga särskilda risker</div>}
      </Fraga>

      {harTanka && (
        <Fraga rubrik="Vad ska du tänka på?">
          {/* Vidas traktdirektiv — samma ruta som i Planeringen; det planeraren strukit står kvar med streck. Stryks i Planeringens ⓘ-kort. */}
          {f.vida && <KommentarVisning vida vidaEtikett="Vida" text={f.vida} meningar struket={f.vidaStruket} />}
          {/* Det som skrivits på kartan — ordagrant. Var det står syns på kartan i Planeringen. */}
          {(texter.length > 0 || kartText === 'fel') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>Skrivet på kartan</div>
              {kartText === 'fel'
                ? <div role="alert" style={{ ...TYP.text, color: FARG.orange }}>Kunde inte läsa det som står på kartan</div>
                : <KartRader texter={texter} />}
            </div>
          )}
          {tanka.length > 0 && <Rader rader={tanka} />}
        </Fraga>
      )}

      {kora.length > 0 && <Fraga rubrik="Hur är det att köra där?"><Rader rader={kora} /></Fraga>}

      {(f.markagare || agare.length > 0) && (
        <Fraga rubrik="Vem äger skogen?">
          {f.markagare?.namn && <div style={{ ...TYP.text, overflowWrap: 'anywhere' }}>{f.markagare.namn}</div>}
          {agare.length > 0 && <Rader rader={agare} />}
          {f.markagare?.telHref && <a href={f.markagare.telHref} style={KNAPP_LITEN}><SvgRing />Ring markägaren</a>}
        </Fraga>
      )}

      {f.dokument.length > 0 && (
        <Fraga rubrik="Papper om trakten">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {f.dokument.map((d) => (
              <a key={d.namn} href={d.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, color: FARG.text, textDecoration: 'none', borderBottom: `1px solid ${FARG.linje}`, ...TYP.text }}>
                <span>{d.namn}</span><span style={{ color: FARG.text2 }}>›</span>
              </a>
            ))}
          </div>
        </Fraga>
      )}

      {ingetSkrivet && <div className="mp-hel" style={{ ...TYP.text, color: FARG.text2 }}>Planeraren har inte skrivit något om den här trakten.</div>}
    </div></div>
  );
}

interface PlanRad { id: string; objekt: OversiktObjekt; etikett: string; nu: boolean; nasta: boolean; stracka: string | null }

export function MinPlan({ f, namn, legs, varning, korDit, posFel, forman, onKarta }: {
  f: MaskinForslag; namn: string; legs: (number | null)[]; varning: (objektId: string) => VarningsSvar;
  /** "Kör dit" till en trakt (sidans knapp — samma mål och km som i arken). */
  korDit: (objekt: OversiktObjekt) => React.ReactNode; posFel: boolean;
  /** Förmannen tittar på en förares plan: knappen går tillbaka till kartan i stället för "Se alla maskiner". */
  forman: boolean; onKarta: () => void;
}) {
  const roll: Roll = f.typ === 'skotare' ? 'skotare' : 'skordare';
  const ko = f.ko.filter((p) => p.kalla === 'ko');
  const forslag = f.ko.filter((p) => p.kalla === 'forslag');
  const lista = ko.length ? ko : forslag;                     // utan kö: appens förslag, och det står att det är förslag
  const nuId = f.nuObjekt?.id ?? null;
  const franNamn = (i: number) => (i === 0 ? (f.nuObjekt ? koNamn(f.nuObjekt) : null) : koNamn(lista[i - 1].objekt));

  // Körordningen: trakten maskinen står på, sedan Nästa, sedan resten.
  const rader: PlanRad[] = [
    ...(f.nuObjekt ? [{ id: f.nuObjekt.id, objekt: f.nuObjekt, etikett: 'Här nu', nu: true, nasta: false, stracka: null }] : []),
    ...lista.filter((p) => p.objekt.id !== nuId).map((p, i) => ({
      id: p.objekt.id, objekt: p.objekt, nu: false, nasta: i === 0,
      etikett: i === 0 ? (ko.length ? 'Nästa' : 'Nästa · appens förslag') : 'Sedan',
      stracka: strackaText(legs[i], franNamn(i)),
    })),
  ];
  const forsta = rader[0]?.id ?? null;
  const [vald, setVald] = useState<string | null>(forsta);
  const [vy, setVy] = useState<'lista' | 'trakt'>('lista'); // bara under 1100 px
  // Ny trakt för maskinen → valet hoppar dit (föraren ska aldrig läsa om fel trakt utan att märka det).
  useEffect(() => { setVald(forsta); }, [nuId]); // eslint-disable-line react-hooks/exhaustive-deps
  const valdRad = rader.find((r) => r.id === vald) ?? rader[0] ?? null;
  const nastaRad = rader.find((r) => r.nasta) ?? null;

  // Kartans kommentarer för trakterna i planen — EN läsning. Bara läsning; skrivs i Planeringen.
  const idNyckel = rader.map((r) => r.id).join(',');
  const [kartText, setKartText] = useState<Record<string, string[]> | 'laddar' | 'fel'>('laddar');
  useEffect(() => {
    if (!idNyckel) { setKartText({}); return; }
    let aktiv = true; setKartText('laddar');
    supabase.from('kartkommentar').select('objekt_id, text, skapad_at').in('objekt_id', idNyckel.split(',')).order('skapad_at', { ascending: true })
      .then(({ data, error }) => {
        if (!aktiv) return;
        if (error || !Array.isArray(data)) { console.error('[oversikt] kartkommentar', error); setKartText('fel'); return; }
        const ut: Record<string, string[]> = {};
        for (const r of data as { objekt_id: string; text: string | null }[]) { const t = r.text?.trim(); if (t) (ut[r.objekt_id] ??= []).push(t); }
        setKartText(ut);
      });
    return () => { aktiv = false; };
  }, [idNyckel]);
  const kartFor = (id: string): KartText => (typeof kartText === 'string' ? kartText : kartText[id] ?? []);

  const valj = (id: string) => { setVald(id); setVy('trakt'); };
  const vo = valdRad ? (valdRad.objekt as unknown as PlanObjekt) : null;

  return (
    <div role="dialog" aria-label={`Plan för ${namn}`} className={`mp-vy-${vy}`}
      style={{ position: 'absolute', inset: 0, zIndex: 20, overflowY: 'auto', background: FARG.bg, color: FARG.text, userSelect: 'none', WebkitUserSelect: 'none' }}>
      <style>{MP_CSS}</style>
      <div className="mp-ram">

        {/* LISTAN — körordningen */}
        <aside className="mp-lista" aria-label="Körordning">
          <div className="mp-inre">
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <div style={{ ...TYP.titel }}>{namn}</div>
              <div style={{ ...TYP.meta, color: FARG.text2 }}>{forman ? 'Förarens plan' : 'Din plan'}</div>
            </div>
            {!f.nuObjekt && <div style={{ ...TYP.text, color: posFel ? FARG.orange : FARG.text2 }}>{posFel ? POS_NU_TEXT : 'Står inte på något objekt just nu'}</div>}
            {rader.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {rader.map((r) => {
                  const o = r.objekt as unknown as PlanObjekt; const arVald = r.id === valdRad?.id;
                  return (
                    <button key={r.id} onClick={() => valj(r.id)} aria-current={arVald ? 'true' : undefined}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: AVSTAND.xs, minHeight: 44, padding: AVSTAND.m,
                        background: arVald ? FARG.upphojt : FARG.kort, border: 'none', borderRadius: RADIE.kort, color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                      {/* Nästa står i vit text — det är den trakten föraren ska förbereda sig för. */}
                      <div style={{ ...TYP.micro, color: r.nasta ? FARG.text : FARG.text2 }}>{r.etikett}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, ...TYP.listtitel }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{koNamn(r.objekt)}</span><span style={{ color: FARG.text2 }}>›</span>
                      </div>
                      <div style={{ ...TYP.meta, color: FARG.text2 }}>{[faktaRad(o), r.stracka].filter(Boolean).join(' · ')}</div>
                      {!r.nu && <div style={{ ...TYP.meta }}><StatusOrd o={o} /></div>}
                    </button>
                  );
                })}
              </div>
            ) : <div style={{ ...TYP.text, color: FARG.text2 }}>Inget planerat efter det här.</div>}
            <button onClick={onKarta} style={{ ...KNAPP_LITEN }}>{forman ? 'Tillbaka till kartan' : 'Se alla maskiner på kartan'}</button>
          </div>
        </aside>

        {/* TRAKTEN — den man valt */}
        <main className="mp-trakt">
          {valdRad && vo ? (
            <div className="mp-inre">
              <button className="mp-bara-smal" onClick={() => setVy('lista')}
                style={{ alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 'none', background: 'none', color: FARG.bla, fontFamily: 'inherit', cursor: 'pointer', ...TYP.text }}>‹ Min plan</button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                <div style={{ ...TYP.micro, color: FARG.text2 }}>{valdRad.etikett}</div>
                <div style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{koNamn(valdRad.objekt)}</div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>{[faktaRad(vo), valdRad.stracka].filter(Boolean).join(' · ')}</div>
                <div style={{ ...TYP.text }}>
                  {/* Där maskinen står är "Här nu" — aldrig databasens "Klar att köra" (Bondeskog stod planerad medan Giant körde där). */}
                  {valdRad.nu
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RADIE.cirkel, background: FARG.gron }} />Här nu</span>
                    : <StatusOrd o={vo} />}
                </div>
              </div>
              {!valdRad.nu && korDit(valdRad.objekt)}
              <TraktFragor o={vo} roll={roll} warn={varning(valdRad.id)} kartText={kartFor(valdRad.id)} />
              {/* Står man på NU pekar sidan på Nästa — det är den man ska förbereda sig för. */}
              {valdRad.nu && nastaRad && (
                <button onClick={() => valj(nastaRad.id)}
                  style={{ ...mpKort, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', border: 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 44 }}>
                  <span style={{ minWidth: 0 }}><span style={{ ...TYP.meta, color: FARG.text2 }}>Förbered dig för nästa · </span><span style={{ ...TYP.listtitel }}>{koNamn(nastaRad.objekt)}</span></span>
                  <span style={{ color: FARG.text2 }}>›</span>
                </button>
              )}
            </div>
          ) : (
            <div className="mp-inre"><div style={{ ...TYP.text, color: FARG.text2 }}>Inget att visa.</div></div>
          )}
        </main>
      </div>
    </div>
  );
}

