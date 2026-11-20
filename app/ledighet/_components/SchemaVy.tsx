'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { raderaVerifierat } from '@/lib/supabase-save';
import { AVSTAND, FARG, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, VIKT, overgang } from '@/lib/design/tokens';
import { MANADSNAMN, arHelg, arRodDag, fmtPeriod, toISO } from './datum';
import { useSchemaData, type SchemaStopp } from './useSchemaData';
import { AVDELARE_H, HUVUD_H, MASKIN_H, NAMN_W, PERSON_H, merAttSeAtHoger, schemaDagar } from './schemaMatt';
import StoppFormular from './StoppFormular';
import StoppDetalj from './StoppDetalj';
import { KORT_TEXTKNAPP, LasFel, StatusText } from './delar';
import Ikon from '@/components/design/Ikon';

const VECKOBOKSTAV = ['S', 'M', 'T', 'O', 'T', 'F', 'L']; // getDay()-index

function addDagar(d: Date, n: number): Date {
  const ny = new Date(d);
  ny.setDate(ny.getDate() + n);
  return ny;
}

/** Slår ihop sammanhängande täckta dagar till block: [{start, len}] */
function block(dagar: string[], tacker: (iso: string) => boolean): { start: number; len: number }[] {
  const ut: { start: number; len: number }[] = [];
  let i = 0;
  while (i < dagar.length) {
    if (!tacker(dagar[i])) { i++; continue; }
    const start = i;
    while (i < dagar.length && tacker(dagar[i])) i++;
    ut.push({ start, len: i - start });
  }
  return ut;
}

/**
 * "Schema" — delad lagöversikt med Excel-känsla. En rad per person (förnamn),
 * en rad per aktiv maskin. Grönt block = godkänd ledighet, rött = maskinstopp,
 * tomt = på jobbet. Dag-upplösning, fast namnkolumn.
 *
 * Bredd (KOLUMN): på telefon 21 dagar med scroll i sidled; på iPad/dator så många hela veckor som
 * ryms utan scroll (`schemaDagar`). Träffytor: personrader 44 px, maskinrader 48 px; ett stoppblock
 * (godkännare) är en knapp som fyller hela radens höjd och är minst 44 px bred — trycket öppnar
 * `StoppDetalj`, där Ta bort har bekräftelse. Förr: 20 px höga block som tog bort stoppet direkt.
 */
export default function SchemaVy({
  arGodkannare = false, egenMedarbetareId,
}: {
  arGodkannare?: boolean;
  egenMedarbetareId?: string;
}) {
  const { personer, ledigheter, maskiner, stopp, laddar, lasfel, hamtaOm } = useSchemaData();
  const [offset, setOffset] = useState(0); // dagar, i 7-dagars-steg
  const [stoppFormOppen, setStoppFormOppen] = useState(false);
  const [valtStopp, setValtStopp] = useState<SchemaStopp | null>(null);
  const [stoppFel, setStoppFel] = useState<string | null>(null);

  // Kolumnens bredd styr antalet dagar. Mäts på rutnätets ram (finns först när data lästs).
  const ramRef = useRef<HTMLDivElement>(null);
  const [kolumnBredd, setKolumnBredd] = useState(0);
  useLayoutEffect(() => {
    const el = ramRef.current;
    if (!el) return;
    const mat = () => setKolumnBredd(el.clientWidth);
    mat();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mat);
    ro.observe(el);
    return () => ro.disconnect();
  }, [laddar, lasfel]);
  const { antal, dagBredd } = schemaDagar(kolumnBredd);

  // Mer att se åt höger? Då tonar rutans högerkant ut — den enda antydan om att det går att svepa i sidled (telefon).
  const [merAtHoger, setMerAtHoger] = useState(false);
  const uppdateraSkroll = () => {
    const el = ramRef.current;
    if (el) setMerAtHoger(merAttSeAtHoger(el.scrollLeft, el.clientWidth, el.scrollWidth));
  };
  useLayoutEffect(uppdateraSkroll, [laddar, lasfel, antal, dagBredd, kolumnBredd, personer.length, maskiner.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bekräftelsen sker i StoppDetalj ("Nej / Ja, ta bort") — hit kommer vi först när godkännaren sagt ja.
  const taBortStopp = async (s: SchemaStopp) => {
    setStoppFel(null);
    const res = await raderaVerifierat(supabase, 'stopp', { id: s.id });
    if (!res.ok) {
      setStoppFel(res.fel);
      return;
    }
    setValtStopp(null);
    hamtaOm(); // stopp_maskin kaskadar bort i databasen
  };

  const idagIso = toISO(new Date());
  const dagar = useMemo(() => {
    const start = addDagar(new Date(), -2 + offset);
    return Array.from({ length: antal }, (_, i) => toISO(addDagar(start, i)));
  }, [offset, antal]);

  const periodText = useMemo(() => {
    const f = dagar[0].split('-'), t = dagar[dagar.length - 1].split('-');
    const fm = MANADSNAMN[parseInt(f[1], 10) - 1].substring(0, 3);
    const tm = MANADSNAMN[parseInt(t[1], 10) - 1].substring(0, 3);
    return `${parseInt(f[2], 10)} ${fm} – ${parseInt(t[2], 10)} ${tm}`;
  }, [dagar]);

  if (lasfel) return <LasFel text={lasfel} onForsok={hamtaOm} />;
  if (laddar) return <StatusText text="Läser schemat…" />;

  const gridBredd = antal * dagBredd;
  const idagIdx = dagar.indexOf(idagIso); // -1 = idag syns inte i veckorna som visas → ingen flik, ingen ram
  const navKnapp: React.CSSProperties = { ...KNAPP.tertiar, width: TRAFFYTA.min, justifyContent: 'center', color: FARG.text };

  const stickyCell = (h: number, bg: string = FARG.kort): React.CSSProperties => ({
    position: 'sticky', left: 0, zIndex: 2, width: NAMN_W, flexShrink: 0,
    height: h, display: 'flex', alignItems: 'center', padding: `0 ${AVSTAND.s}px`,
    background: bg, borderRight: `1px solid ${FARG.linje}`, boxSizing: 'border-box',
  });

  const dagBakgrund = (iso: string): string => {
    if (iso === idagIso) return FARG.fyllning;
    if (arHelg(iso) || arRodDag(iso)) return FARG.tonad;
    return 'transparent';
  };

  const dagCeller = (h: number) => (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      {dagar.map(iso => (
        <div key={iso} style={{
          width: dagBredd, height: h, boxSizing: 'border-box', flexShrink: 0,
          borderRight: `1px solid ${FARG.tonad}`, borderBottom: `1px solid ${FARG.tonad}`,
          background: dagBakgrund(iso),
        }} />
      ))}
    </div>
  );

  const ledigBlock = (h: number, segs: { start: number; len: number }[]) => (
    <div style={{ position: 'relative', width: gridBredd, height: h, flexShrink: 0 }}>
      {dagCeller(h)}
      {segs.map(s => (
        <div key={s.start} style={{
          position: 'absolute', top: AVSTAND.s, bottom: AVSTAND.s,
          left: s.start * dagBredd + 2, width: s.len * dagBredd - 4,
          background: FARG.gron, borderRadius: RADIE.stapel,
        }} />
      ))}
    </div>
  );

  return (
    <div>
      {/* Navigering */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, marginBottom: AVSTAND.s }}>
        <span style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{periodText}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
          <button type="button" aria-label="Tidigare vecka" onClick={() => setOffset(o => o - 7)} style={navKnapp}><Ikon namn="chevron_left" farg="inherit" /></button>
          {offset !== 0 && <button type="button" onClick={() => setOffset(0)} style={{ ...KNAPP.lank, ...KORT_TEXTKNAPP, padding: `0 ${AVSTAND.s}px` }}>Idag</button>}
          <button type="button" aria-label="Nästa vecka" onClick={() => setOffset(o => o + 7)} style={navKnapp}><Ikon namn="chevron_right" farg="inherit" /></button>
        </div>
      </div>

      {/* Lägg till stopp — bara godkännare (RLS spärrar ändå skrivningen) */}
      {arGodkannare && (
        <button type="button" onClick={() => setStoppFormOppen(true)} style={{ ...KNAPP.sekundar, marginBottom: AVSTAND.m }}>
          <Ikon namn="add" farg="inherit" />Lägg till stopp
        </button>
      )}

      {/* Teckenförklaring ÖVERST, över tabellen (alla bredder): färgen i staplarna är värdelös utan den. Ord bär, färgen förstärker.
          "Tomt = på jobbet" står kvar bredvid, så grönt aldrig kan läsas som "på jobbet". */}
      <div style={{ display: 'flex', gap: AVSTAND.l, flexWrap: 'wrap', marginBottom: AVSTAND.s, padding: `0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          <span aria-hidden style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: RADIE.stapel, background: FARG.gron, display: 'inline-block' }} />Ledig
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
          <span aria-hidden style={{ width: AVSTAND.l, height: AVSTAND.s, borderRadius: RADIE.stapel, background: FARG.rod, display: 'inline-block' }} />Maskinstopp
        </span>
        <span>Tomt = på jobbet</span>
      </div>

      {/* Tidslinjen — på telefon scroll i sidled bakom fast namnkolumn, på bred skärm ryms den */}
      <div style={{ position: 'relative' }}>
      <div ref={ramRef} onScroll={uppdateraSkroll} data-schema-ram style={{ ...KORT, padding: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ position: 'relative', width: NAMN_W + gridBredd }}>

          {/* Rubrikrad: veckodag + dagnummer (månadsbyte visar månad) */}
          <div style={{ display: 'flex' }}>
            <div style={stickyCell(HUVUD_H)} />
            <div style={{ display: 'flex', width: gridBredd, flexShrink: 0 }}>
              {dagar.map(iso => {
                const d = new Date(iso + 'T00:00:00');
                const helgdag = arHelg(iso) || arRodDag(iso);
                const arIdag = iso === idagIso;
                const forstaIManad = d.getDate() === 1;
                return (
                  <div key={iso} data-dag={iso} aria-current={arIdag ? 'date' : undefined} style={{
                    width: dagBredd, height: HUVUD_H, boxSizing: 'border-box', flexShrink: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: AVSTAND.xs,
                    borderRight: `1px solid ${FARG.tonad}`, borderBottom: `1px solid ${FARG.linje}`,
                    background: dagBakgrund(iso),
                  }}>
                    {/* IDAG: ordet bär (färgen är aldrig ensam), vit fylld flik. Får vara bredare än kolumnen (34 px) — grannarna har tomt här. */}
                    {arIdag && (
                      <span data-schema-idag-flik style={{ ...TYP.micro, position: 'relative', zIndex: 3, flexShrink: 0, height: AVSTAND.l, marginBottom: AVSTAND.xs, padding: `0 ${AVSTAND.xs}px`, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', borderRadius: RADIE.rad, background: FARG.text, color: FARG.bg }}>
                        Idag
                      </span>
                    )}
                    <span style={{ ...TYP.micro, color: helgdag ? FARG.rod : arIdag ? FARG.text : FARG.text2 }}>
                      {forstaIManad ? MANADSNAMN[d.getMonth()].substring(0, 3) : VECKOBOKSTAV[d.getDay()]}
                    </span>
                    {/* Datumsiffran har en fast ruta (24 px) på ALLA dagar så veckodagsbokstäverna står på samma linje; idag är rutan INVERTERAD (vit, svart siffra). */}
                    <span data-dag-tal style={{ ...TYP.meta, ...TNUM, width: AVSTAND.xl, height: AVSTAND.xl, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: RADIE.cirkel,
                      background: arIdag ? FARG.text : 'transparent', fontWeight: arIdag ? VIKT.fet : VIKT.normal, color: arIdag ? FARG.bg : helgdag ? FARG.rod : FARG.text }}>
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personrader */}
          {personer.map(p => {
            const mina = ledigheter.filter(l => l.medarbetare_id === p.id);
            const segs = block(dagar, iso => mina.some(l => iso >= l.startdatum && iso <= l.slutdatum));
            return (
              <div key={p.id} style={{ display: 'flex' }}>
                <div style={stickyCell(PERSON_H)}>
                  <span style={{ ...TYP.meta, fontWeight: VIKT.halvfet, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.fornamn}
                  </span>
                </div>
                {ledigBlock(PERSON_H, segs)}
              </div>
            );
          })}

          {/* Avdelare + maskinrader */}
          <div style={{ display: 'flex' }}>
            <div style={stickyCell(AVDELARE_H, FARG.upphojt)}>
              <span style={{ ...TYP.micro, color: FARG.text2 }}>Maskiner</span>
            </div>
            <div style={{ width: gridBredd, height: AVDELARE_H, flexShrink: 0, background: FARG.upphojt, boxSizing: 'border-box' }} />
          </div>

          {maskiner.map(m => {
            const minaStopp = stopp.filter(s => s.maskin_ids.includes(m.maskin_id));
            return (
              <div key={m.maskin_id} style={{ display: 'flex' }}>
                <div style={stickyCell(MASKIN_H)}>
                  <span style={{ ...TYP.meta, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.namn}
                  </span>
                </div>
                {/* Ett block per stopp (inte ihopslagen täckning) — så att godkännaren kan trycka på just det stoppet */}
                <div style={{ position: 'relative', width: gridBredd, height: MASKIN_H, flexShrink: 0 }}>
                  {dagCeller(MASKIN_H)}
                  {minaStopp.map(s => {
                    const sIdx = dagar.findIndex(d => d >= s.fran_datum);
                    const eIdx = dagar.filter(d => d <= s.till_datum).length - 1;
                    if (sIdx === -1 || eIdx < sIdx) return null;
                    // Det SYNLIGA blocket följer dagarna; träffytan (knappen) är minst 44 px bred och
                    // lika hög som raden, så ett endagsstopp går att träffa med ett finger.
                    const synligLeft = sIdx * dagBredd + 2;
                    const synligBredd = (eIdx - sIdx + 1) * dagBredd - 4;
                    const traffBredd = Math.max(synligBredd, TRAFFYTA.min);
                    const traffLeft = Math.max(0, Math.min(gridBredd - traffBredd, synligLeft + synligBredd / 2 - traffBredd / 2));
                    const synligt = (
                      <span aria-hidden style={{
                        position: 'absolute', top: AVSTAND.xs, bottom: AVSTAND.xs,
                        left: synligLeft - traffLeft, width: synligBredd,
                        background: FARG.rod, borderRadius: RADIE.stapel,
                      }} />
                    );
                    const ram: React.CSSProperties = { position: 'absolute', top: 0, height: MASKIN_H, left: traffLeft, width: traffBredd };
                    return arGodkannare ? (
                      <button key={s.id} type="button"
                        aria-label={`Maskinstopp ${fmtPeriod(s.fran_datum, s.till_datum)} — visa`}
                        onClick={() => { setStoppFel(null); setValtStopp(s); }}
                        style={{ ...ram, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                        {synligt}
                      </button>
                    ) : (
                      <div key={s.id} style={ram}>{synligt}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Dagens KOLUMN: en lodrät vit inramning hela vägen ner genom alla person- och maskinrader (ovanpå ett ljusare band
              i cellerna), från under IDAG-fliken. Så "nu" syns oavsett vilken rad man tittar på. Fångar inga tryck (stoppblocken ligger under). */}
          {idagIdx >= 0 && (
            <div aria-hidden data-schema-idag style={{ position: 'absolute', top: AVSTAND.l + AVSTAND.xs, bottom: 0, left: NAMN_W + idagIdx * dagBredd, width: dagBredd, boxSizing: 'border-box', zIndex: 1, pointerEvents: 'none',
              borderLeft: `2px solid ${FARG.text}`, borderRight: `2px solid ${FARG.text}` }} />
          )}
        </div>
      </div>
        {/* Högerkanten tonar ut när fler dagar väntar åt höger; försvinner när man svept till slutet. Rör inte tryck (pointer-events). */}
        <div aria-hidden data-schema-mer={merAtHoger ? 'ja' : 'nej'} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: AVSTAND.xxl, pointerEvents: 'none', borderRadius: `0 ${RADIE.kort}px ${RADIE.kort}px 0`, background: `linear-gradient(to right, transparent, ${FARG.kort})`, opacity: merAtHoger ? 1 : 0, transition: overgang('opacity') }} />
      </div>

      {arGodkannare && <p style={{ margin: `${AVSTAND.m}px 0 0`, padding: `0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>Tryck på ett rött block för att se stoppet eller ta bort det</p>}

      {stoppFormOppen && egenMedarbetareId && (
        <StoppFormular
          maskiner={maskiner}
          egenMedarbetareId={egenMedarbetareId}
          onStang={() => setStoppFormOppen(false)}
          onSparad={() => { setStoppFormOppen(false); hamtaOm(); }}
        />
      )}

      {valtStopp && (
        <StoppDetalj
          stopp={valtStopp}
          maskiner={maskiner}
          fel={stoppFel}
          onStang={() => { setValtStopp(null); setStoppFel(null); }}
          onTaBort={() => taBortStopp(valtStopp)}
        />
      )}
    </div>
  );
}
