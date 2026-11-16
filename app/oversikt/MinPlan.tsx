'use client';
// MIN PLAN — förarens sida i Översikten. Regler och ord: ./plan.ts; sidan (page.tsx) ger kön, faror och Kör dit.
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FARG, TYP, AVSTAND, RADIE, KOLUMN, KNAPP } from '@/lib/design/tokens';
import { KommentarVisning } from '@/components/planering/KommentarRuta';
import { giltigVidaText } from '@/lib/vidaStruket';
import { fasSteg } from '@/lib/objektVal';
import { FasSteg } from '@/components/objekt/FasSteg';
import { analysRader, lasTraktAnalys, type TraktAnalys } from './traktanalys';
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

/** Det som skrivits på kartan för en trakt (kartkommentar): texterna som gäller HELA trakten (traktdelen) och antalet som hör till en plats.
 *  'laddar' medan det läses, 'fel' när det inte gick — aldrig tyst tomt. */
type KartText = { hela: string[]; platser: number } | 'laddar' | 'fel';
/** En kommentar på traktdelen gäller hela trakten; allt annat (markering, yta, avlägg, punkt) hör till en plats och kommer upp i hytten där. */
export const gallerHelaTrakten = (ytaNyckel: string | null | undefined): boolean => /^traktdel:/.test(ytaNyckel ?? '');

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

/** Högst så många saker under "Innan du åker" — resten står under Mer om trakten. */
const INNAN_MAX = 3;

/**
 * Nästa trakt som ett boardingkort (Martin 2026-11-05: "hur hade Apple, Tesla, SpaceX gjort … så ett barn förstår direkt"):
 *   FARLIGT          riskerna med vad man gör — alltid, överst
 *   SKYDDAT          vad traktanalysen hittat (fossil åker, vattenskydd …) — bara när något hittats, eller när det inte kunde kontrolleras
 *   INNAN DU ÅKER    högst tre saker att ha med eller göra (band, trailern, ved …)
 *   NÄR DU ÄR DÄR    det som gäller hela trakten (Vidas text utan det strukna, traktdelens kommentarer) + "N saker är märkta på kartan"
 *   MER OM TRAKTEN › resten, för den som vill
 * Det som hör till en plats ("denna stigen") listas inte: det kommer upp i hytten när maskinen kör dit.
 */
function TraktFragor({ maskinId, o, roll, warn, kartText, analys }: { maskinId: string; o: PlanObjekt; roll: Roll; warn: VarningsSvar; kartText: KartText; analys: TraktAnalys }) {
  const f = forbered(o, roll, warn);
  const [mer, setMer] = useState(false);
  const skydd = analysRader(analys);
  const ved = f.rader.filter((r) => r.grupp === 'agare');
  const innanAlla = [...f.rader.filter((r) => r.varning && r.grupp !== 'agare'), ...ved];
  const innan = innanAlla.slice(0, INNAN_MAX);
  const ovriga = f.rader.filter((r) => !innan.includes(r));
  const vida = giltigVidaText(f.vida, f.vidaStruket);   // föraren ser bara det som gäller — strecket står i Planeringen
  const hela = typeof kartText === 'object' ? kartText.hela : [];
  const platser = typeof kartText === 'object' ? kartText.platser : 0;
  const harDar = !!vida || hela.length > 0 || platser > 0 || kartText === 'fel';
  const ringIInnan = ved.length > 0 && innan.some((r) => r.grupp === 'agare') && !!f.markagare?.telHref;
  const harMer = ovriga.length > 0 || !!f.markagare || f.dokument.length > 0;
  return (
    <div className="mp-fragor-ram"><div className="mp-fragor">
      <Fraga rubrik="Farligt" hel>
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

      {/* Traktanalysen: inget hittat = ingen rad (aldrig "ingen fossil åker" — RAÄ har inte allt); kunde inte köras = det sägs. */}
      {skydd.length > 0 && (
        <Fraga rubrik="Skyddat på trakten" hel>
          {skydd.map((r, i) => (
            <div key={i} style={{ ...TYP.text, display: 'flex', alignItems: 'center', gap: AVSTAND.s, color: r.fel ? FARG.orange : FARG.text }}>
              {r.farg && <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: RADIE.cirkel, background: r.farg, flexShrink: 0 }} />}
              <span style={{ overflowWrap: 'anywhere' }}>{r.text}</span>
            </div>
          ))}
        </Fraga>
      )}

      {innan.length > 0 && (
        <Fraga rubrik="Innan du åker">
          <Rader rader={innan} />
          {ringIInnan && <a href={f.markagare!.telHref!} style={KNAPP_LITEN}><SvgRing />Ring markägaren</a>}
        </Fraga>
      )}

      {harDar && (
        <Fraga rubrik="När du är där">
          {vida && <KommentarVisning vida vidaEtikett="Vida" text={vida} meningar />}
          {hela.length > 0 && <KartRader texter={hela} />}
          {kartText === 'fel' && <div role="alert" style={{ ...TYP.text, color: FARG.orange }}>Kunde inte läsa det som står på kartan</div>}
          {/* Bara information — vägen till kartan är "Öppna trakten på kartan" högst upp (Martin 2026-11-06: "finns på två ställen"). */}
          {platser > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ ...TYP.text }}>{platser === 1 ? '1 sak är märkt på kartan' : `${platser} saker är märkta på kartan`}</span>
              <span style={{ ...TYP.meta, color: FARG.text2 }}>De kommer upp i hytten när du kör dit</span>
            </div>
          )}
        </Fraga>
      )}

      {harMer && (
        <section className="mp-hel" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <button type="button" onClick={() => setMer((m) => !m)} aria-expanded={mer}
            style={{ ...mpKort, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', border: 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 44, ...TYP.listtitel }}>
            <span>Mer om trakten</span><span style={{ color: FARG.text2 }}>{mer ? '⌃' : '›'}</span>
          </button>
          {mer && (
            <div style={mpKort}>
              {ovriga.length > 0 && <Rader rader={ovriga} />}
              {f.markagare && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                  {f.markagare.namn && <div style={{ ...TYP.text, overflowWrap: 'anywhere' }}><span style={{ color: FARG.text2 }}>Markägare </span>{f.markagare.namn}</div>}
                  {f.markagare.telHref && !ringIInnan && <a href={f.markagare.telHref} style={KNAPP_LITEN}><SvgRing />Ring markägaren</a>}
                </div>
              )}
              {f.dokument.map((d) => (
                <a key={d.namn} href={d.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, color: FARG.text, textDecoration: 'none', borderTop: `1px solid ${FARG.linje}`, ...TYP.text }}>
                  <span>{d.namn}</span><span style={{ color: FARG.text2 }}>›</span>
                </a>
              ))}
            </div>
          )}
        </section>
      )}
    </div></div>
  );
}

interface PlanRad { id: string; objekt: OversiktObjekt; etikett: string; nu: boolean; nasta: boolean; stracka: string | null }

export function MinPlan({ f, namn, legs, varning, korDit, posFel, forman, onKarta, analysFor = lasTraktAnalys, startTrakt = null }: {
  f: MaskinForslag; namn: string; legs: (number | null)[]; varning: (objektId: string) => VarningsSvar;
  /** "Kör dit" till en trakt (sidans knapp — samma mål och km som i arken). */
  korDit: (objekt: OversiktObjekt) => React.ReactNode; posFel: boolean;
  /** Förmannen tittar på en förares plan: knappen går tillbaka till kartan i stället för "Se alla maskiner". */
  forman: boolean; onKarta: () => void;
  /** Traktanalysen per trakt (./traktanalys). Standard = kopplingen; testerna ger påhittad data. */
  analysFor?: (o: OversiktObjekt) => TraktAnalys;
  /** Trakten som ska vara öppen när planen visas (tillbaka från Planeringen). */
  startTrakt?: string | null;
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
  // Tillbaka från kartan i Planeringen ("‹ Översikt"): samma trakt öppen igen.
  const start = startTrakt && rader.some((r) => r.id === startTrakt) ? startTrakt : null;
  const [vald, setVald] = useState<string | null>(start ?? forsta);
  const [vy, setVy] = useState<'lista' | 'trakt'>(start ? 'trakt' : 'lista'); // bara under 1100 px
  // Ny trakt för maskinen → valet hoppar dit (föraren ska aldrig läsa om fel trakt utan att märka det). Inte vid första visningen.
  const forstaNu = useRef(true);
  useEffect(() => { if (forstaNu.current) { forstaNu.current = false; return; } setVald(forsta); }, [nuId]); // eslint-disable-line react-hooks/exhaustive-deps
  const valdRad = rader.find((r) => r.id === vald) ?? rader[0] ?? null;
  const nastaRad = rader.find((r) => r.nasta) ?? null;

  // Kartans kommentarer för trakterna i planen — EN läsning. Bara läsning; skrivs i Planeringen.
  const idNyckel = rader.map((r) => r.id).join(',');
  const [kartText, setKartText] = useState<Record<string, { hela: string[]; platser: number }> | 'laddar' | 'fel'>('laddar');
  useEffect(() => {
    if (!idNyckel) { setKartText({}); return; }
    let aktiv = true; setKartText('laddar');
    supabase.from('kartkommentar').select('objekt_id, yta_nyckel, text, skapad_at').in('objekt_id', idNyckel.split(',')).order('skapad_at', { ascending: true })
      .then(({ data, error }) => {
        if (!aktiv) return;
        if (error || !Array.isArray(data)) { console.error('[oversikt] kartkommentar', error); setKartText('fel'); return; }
        const ut: Record<string, { hela: string[]; platser: number }> = {};
        for (const r of data as { objekt_id: string; yta_nyckel: string | null; text: string | null }[]) {
          const t = r.text?.trim(); if (!t) continue;
          const u = (ut[r.objekt_id] ??= { hela: [], platser: 0 });
          if (gallerHelaTrakten(r.yta_nyckel)) u.hela.push(t); else u.platser += 1;
        }
        setKartText(ut);
      });
    return () => { aktiv = false; };
  }, [idNyckel]);
  const kartFor = (id: string): KartText => (typeof kartText === 'string' ? kartText : kartText[id] ?? { hela: [], platser: 0 });

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
            {/* Tillbaka till kartan — alltid på samma ställe, överst (Martin 2026-11-06: "måste finnas så jag kan komma till kartan igen"). */}
            <button type="button" onClick={onKarta} style={{ ...KNAPP.lank, alignSelf: 'flex-start', padding: 0 }}>‹ Kartan</button>
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
                    <button key={r.id} data-rad="" onClick={() => valj(r.id)} aria-current={arVald ? 'true' : undefined}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: AVSTAND.xs, minHeight: 44, padding: AVSTAND.m,
                        background: arVald ? FARG.upphojt : FARG.kort, border: 'none', borderRadius: RADIE.kort, color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                      {/* Nästa står i vit text — det är den trakten föraren ska förbereda sig för. */}
                      <div style={{ ...TYP.micro, color: r.nasta ? FARG.text : FARG.text2 }}>{r.etikett}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, ...TYP.listtitel }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{koNamn(r.objekt)}</span><span style={{ color: FARG.text2 }}>›</span>
                      </div>
                      <div style={{ ...TYP.meta, color: FARG.text2 }}>{[faktaRad(o), r.stracka].filter(Boolean).join(' · ')}</div>
                      {(() => { const st = fasSteg(r.objekt as never); return st ? <FasSteg steg={st} /> : !r.nu ? <div style={{ ...TYP.meta }}><StatusOrd o={o} /></div> : null; })()}
                    </button>
                  );
                })}
              </div>
            ) : <div style={{ ...TYP.text, color: FARG.text2 }}>Inget planerat efter det här.</div>}
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
                  {valdRad.nu && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: RADIE.cirkel, background: FARG.gron }} />Här nu</span>}
                  {/* Samma steg som Planeringens lista och Trakter (components/objekt/FasSteg). */}
                  {(() => { const st = fasSteg(valdRad.objekt as never); return st ? <FasSteg steg={st} /> : !valdRad.nu ? <StatusOrd o={vo} /> : null; })()}
                </div>
              </div>
              {!valdRad.nu && korDit(valdRad.objekt)}
              {/* Till trakten i Planeringen (kartan med allt som är märkt) — "‹ Översikt" där tar tillbaka hit. */}
              <a href={`/planering?objekt=${encodeURIComponent(valdRad.id)}&fran=oversikt&plan=${encodeURIComponent(f.maskinId)}`} data-testid="oppna-trakten"
                style={{ ...KNAPP.sekundar, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: FARG.text }}>Öppna trakten på kartan</a>
              <TraktFragor maskinId={f.maskinId} o={vo} roll={roll} warn={varning(valdRad.id)} kartText={kartFor(valdRad.id)} analys={analysFor(valdRad.objekt)} />
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

