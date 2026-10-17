'use client';

// OM TRAKTEN — allt som sagts om trakten på ett ställe, sökbart. EN rad per TYP (lib/omTrakten), i grupper:
//   FAROR (röd rubrik med antal, alltid utfälld: varje fara är en rad) · FRÅN VIDA (texten) · HÄNSYN · VÄGAR · ÖVRIGT.
//   "Basväg · 3 st · 905 m ›", "Röd väg · 3 st ›", "Stenmur · 1 st ›", "Hänsynsytor · 1 st ›", "Högstubbar · 3 av 11 markerade ›".
// Brandrisk (bara när någon dag är 3 eller högre) står direkt under Faror.
// Tryck på en typrad = TYPVYN (har typen bara ETT objekt öppnas objektet direkt): alla av typen markeras på kartan och objekten listas (vägar längst först). Tryck på ett objekt = kartan zoomar dit och framhäver det.
//   Telefon: arket stängs och en liten list nertill säger vad som visas ("Basväg röd · 329 m  ‹ Lista"); Lista tar tillbaka hit — i samma typvy, på samma plats i listan.
//   Bred skärm: panelen ligger kvar.
// Ingen text på raderna om att visa något — hela raden är tryckbar, bara en pil. Kommentar och foto visas på objektets rad i typvyn, aldrig som eget radformat i listan.
// Ren presentation — sidan bygger listorna och ritar kartsymbolerna (`ikon`).

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MarkeringFoto from '@/app/planering/MarkeringFoto';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import {
  AVSANDARE_VIDA, avstandText, efektivPos, filtreraMarkeringar, harFoto, matcharSok, sorteraMarkeringar,
  type KartMarkering, type MarkeringMedAvstand, type TillForarenPost,
} from '@/lib/objektKort';
import { antalFaror, byggOmGrupper, objektTitel, OM_GRUPP_RUBRIK, typRadText, type OmGrupp, type TypRad } from '@/lib/omTrakten';
import BrandriskRad from './BrandriskRad';
import { Gruppkort, Huvud, Pil, Rubrik } from './infoDelar';

export interface OmYta { nr: number; typLabel: string; text: string | null; harLjud: boolean; harFoto: boolean; onOppna: () => void }
export interface OmRestriktion { name?: string; type?: string; details?: string; warning?: string }
export interface OmMiljoRad { id: string; namn: string; antal: number; krav: number | null; uppfyllt: boolean }

/** Var man står i Om trakten — sparas när arket stängs av ett objekt och ges tillbaka när man trycker "‹ Lista". */
export interface OmNav { typ: string | null; scrollLista: number; scrollTyp: number; q: string }

export interface OmTraktenProps {
  objektNamn: string;
  /** objektet vars markeringar listas — nyckel till de lokala fotona som väntar på uppladdning */
  objektId: string | null;
  onTillbaka: () => void;
  onStang: () => void;
  /** Vidas text och planerarens text, hela, med avsändare */
  hela: TillForarenPost[];
  /** "ca 14–22 m mellan träden" ur direktivet — stöd under Vidas text */
  planttext: string | null;
  restriktioner: OmRestriktion[];
  markeringar: KartMarkering[];
  pos: { lat: number; lng: number } | null;
  /** Högstubbar och evighetsträd: antal satta och kravet (null = inget krav, bara antalet) */
  miljo: OmMiljoRad[];
  ytor: OmYta[];
  ikon: (m: KartMarkering) => React.ReactNode;
  /** brandrisk: raden visas bara när någon dag är 3 eller högre */
  brand: { lat: number; lng: number } | null;
  onBrand: () => void;
  onVisa: (m: KartMarkering) => void;
  /** samma objekt en gång till: lämna framhävningen */
  onSlapp: () => void;
  onFoto: (src: string) => void;
  framhavdId: string | null;
  /** återställ var man stod (efter "‹ Lista") */
  start?: OmNav;
  /** sidan sparar var man stod just innan arket stängs av ett objekt */
  onNav: (n: OmNav | null) => void;
  /** typvyn öppnad (alla av typen markeras på kartan) eller stängd (null) */
  onTyp: (m: KartMarkering[] | null) => void;
}

const nyckelSlug = (n: string) => n.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

export default function OmTrakten(p: OmTraktenProps) {
  const [q, setQ] = useState(p.start?.q ?? '');
  const [typ, setTyp] = useState<string | null>(p.start?.typ ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLista = useRef(p.start?.scrollLista ?? 0);
  const scrollTyp = useRef(p.start?.scrollTyp ?? 0);
  // Avstånd och "närmast först" gäller bara när man är på trakten (inom ca 1 km); annars skapad ordning och ingen avståndstext.
  const pos = useMemo(() => efektivPos(p.pos, p.markeringar), [p.pos, p.markeringar]);
  const sokt = q.trim() !== '';
  const traffar = useMemo(() => filtreraMarkeringar(p.markeringar, q), [p.markeringar, q]);
  const ytorTraffar = p.ytor.filter((y) => matcharSok(`${y.typLabel} ${y.text ?? ''}`, q));
  const helaTraffar = p.hela.filter((h) => matcharSok(h.text, q) || matcharSok(h.avsandare, q));
  const restrTraffar = p.restriktioner.filter((r) => matcharSok(`${r.name ?? ''} ${r.type ?? ''} ${r.details ?? ''} ${r.warning ?? ''}`, q));
  // Kravet ("3 av 11 markerade") gäller hela trakten — vid sökning räknas bara träffarna.
  const grupper = useMemo(
    () => byggOmGrupper(traffar, pos, sokt ? null : p.miljo.map((m) => ({ id: m.id as 'hogstubbar' | 'evighetstrad', namn: m.namn, antal: m.antal, krav: m.krav, uppfyllt: m.uppfyllt })), ytorTraffar.map((y) => y.typLabel)),
    [traffar, pos, sokt, p.miljo, ytorTraffar],
  );
  const farorMarkeringar = useMemo(() => sorteraMarkeringar(grupper.find((g) => g.grupp === 'faror')?.rader.flatMap((r) => r.markeringar) ?? [], pos), [grupper, pos]);
  const raderUtanFaror = grupper.filter((g) => g.grupp !== 'faror' && g.grupp !== 'vida');
  const typRad = typ ? grupper.flatMap((g) => g.rader).find((r) => r.nyckel === typ) ?? null : null;
  const inget = sokt && helaTraffar.length === 0 && restrTraffar.length === 0 && grupper.length === 0;
  const tomt = !sokt && p.hela.length === 0 && p.restriktioner.length === 0 && p.markeringar.length === 0 && p.ytor.length === 0 && p.miljo.every((m) => m.krav == null);

  // En typ som försvunnit (sökningen, borttagen markering) → tillbaka till listan.
  useEffect(() => { if (typ && !typRad) setTyp(null); }, [typ, typRad]);
  // Typvyn öppen → alla av typen markeras på kartan. Sidan lämnar markeringen kvar när arket stängs av ett objekt (och släpper den vid ×, Esc och dra ned).
  const onTypRef = useRef(p.onTyp);
  onTypRef.current = p.onTyp;
  const valda = typRad && typRad.markeringar.length > 0 ? typRad.markeringar : null;
  const valdaNyckel = valda ? valda.map((m) => m.id).join('|') : '';
  useEffect(() => { onTypRef.current(valda); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valdaNyckel]);

  // Rullningen sparas per vy och ges tillbaka när man kommer tillbaka (efter ett objekt, eller från typvyn till listan).
  const sparaScroll = () => { const el = scrollRef.current; if (!el) return; if (typ) scrollTyp.current = el.scrollTop; else scrollLista.current = el.scrollTop; };
  useLayoutEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = typ ? scrollTyp.current : scrollLista.current; }, [typ]);
  const tillLista = () => { sparaScroll(); setTyp(null); };
  const visaObjekt = (m: KartMarkering) => { sparaScroll(); p.onNav({ typ, scrollLista: scrollLista.current, scrollTyp: scrollTyp.current, q }); p.onVisa(m); };
  // En typ med bara ETT objekt öppnar objektet direkt — ingen typvy med en enda rad ("‹ Lista" tar då tillbaka till listan). Ytor: ytan öppnas som förut.
  const oppnaTyp = (r: TypRad) => {
    if (r.ytaTyp && r.antal === 1) { ytorTraffar.find((y) => y.typLabel === r.ytaTyp)?.onOppna(); return; }
    if (!r.ytaTyp && r.markeringar.length === 1) { visaObjekt(r.markeringar[0]); return; }
    sparaScroll(); scrollTyp.current = 0; setTyp(r.nyckel);
  };

  const objektProps = { objektId: p.objektId, ikon: p.ikon, framhavdId: p.framhavdId, onVisa: visaObjekt, onSlapp: p.onSlapp, onFoto: p.onFoto };

  if (typRad) {
    return (
      <>
        <Huvud titel={typRadText(typRad)} tillbaka="Om trakten" onTillbaka={tillLista} onStang={p.onStang} />
        <div ref={scrollRef} data-testid="om-innehall" data-vy="typ" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xxl}px` }}>
          {typRad.ytaTyp ? (
            <Gruppkort testid="om-typ-lista">
              {ytorTraffar.filter((y) => y.typLabel === typRad.ytaTyp).map((y, i) => (
                <button key={`${y.nr}-${i}`} type="button" onClick={y.onOppna} className="press-row" data-testid="om-yta"
                  style={{ ...radStil, borderTop: i > 0 ? `1px solid ${FARG.linje}` : 'none' }}>
                  <span style={{ flexShrink: 0, width: AVSTAND.xl + AVSTAND.xs, height: AVSTAND.xl + AVSTAND.xs, borderRadius: RADIE.cirkel, background: FARG.fyllning, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...TYP.meta, fontWeight: 700, ...TNUM }}>{y.nr}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', ...TYP.listtitel }}>{y.typLabel}</span>
                    <span style={{ display: 'block', ...TYP.meta, color: y.text ? FARG.text2 : FARG.text3, overflowWrap: 'anywhere' }}>{y.text || 'Ingen anteckning'}</span>
                  </span>
                  {(y.harLjud || y.harFoto) && <span style={{ ...TYP.meta, color: FARG.text2 }}>{y.harLjud ? 'Ljud' : ''}{y.harLjud && y.harFoto ? ' · ' : ''}{y.harFoto ? 'Foto' : ''}</span>}
                  <Pil />
                </button>
              ))}
            </Gruppkort>
          ) : typRad.markeringar.length === 0 ? (
            <div data-testid="om-typ-tom" style={{ ...TYP.text, color: FARG.text2 }}>Inget satt än.</div>
          ) : (
            <Gruppkort testid="om-typ-lista">
              {typRad.markeringar.map((m, i) => <ObjektRad key={m.id} m={m} forsta={i === 0} {...objektProps} />)}
            </Gruppkort>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Huvud titel="Om trakten" tillbaka={p.objektNamn} onTillbaka={p.onTillbaka} onStang={p.onStang} />
      <div style={{ flexShrink: 0, padding: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>
        <input type="search" data-testid="om-sok" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök i kommentarer och symboler" aria-label="Sök i kommentarer och symboler"
          autoCapitalize="none" autoCorrect="off"
          style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, fontFamily: 'inherit', outline: 'none', ...TYP.text }} />
      </div>

      <div ref={scrollRef} data-testid="om-innehall" data-vy="lista" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.s}px ${AVSTAND.l}px ${AVSTAND.xxl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
        {inget && <div data-testid="om-inget" style={{ ...TYP.text, color: FARG.text2 }}>Inget i trakten matchar ”{q.trim()}”. Sökningen gäller text i kommentarer och namn på symboler.</div>}

        {/* FAROR — röd rubrik med antal, alltid utfälld: varje fara är en rad. Ordet "Faror" bär budskapet, färgen förstärker. */}
        {farorMarkeringar.length > 0 && (
          <section data-testid="om-faror">
            <Rubrik farg={FARG.rod}>{OM_GRUPP_RUBRIK.faror} · {antalFaror(grupper)}</Rubrik>
            <Gruppkort testid="om-faror-rader">
              {farorMarkeringar.map((m, i) => <ObjektRad key={m.id} m={m} forsta={i === 0} {...objektProps} />)}
            </Gruppkort>
          </section>
        )}

        {/* BRANDRISK — bara när någon dag är 3 eller högre; direkt under Faror */}
        {!sokt && p.brand && <BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} />}

        {/* FRÅN VIDA — texten om trakten, med avsändare */}
        {(helaTraffar.length > 0 || restrTraffar.length > 0) && (
          <section data-testid="om-hela">
            <Rubrik>{helaTraffar.some((h) => h.avsandare !== AVSANDARE_VIDA) ? 'Från Vida och planeraren' : OM_GRUPP_RUBRIK.vida}</Rubrik>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {helaTraffar.map((h) => (
                <div key={h.id} data-testid={`om-post-${h.id}`} style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
                  <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{h.avsandare}</div>
                  <div style={{ ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{h.text}</div>
                  {h.id === 'vida' && p.planttext && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{p.planttext}</div>}
                </div>
              ))}
              {restrTraffar.map((r, i) => (
                <div key={i} data-testid="om-restriktion" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
                  <div style={{ ...TYP.listtitel }}>{r.name || 'Område'}{r.type && <span style={{ ...TYP.meta, color: FARG.text2 }}> · {r.type}</span>}</div>
                  {r.details && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{r.details}</div>}
                  {r.warning && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>{r.warning}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* HÄNSYN · VÄGAR · ÖVRIGT — en rad per typ */}
        {raderUtanFaror.map((g) => (
          <section key={g.grupp} data-testid={`om-grupp-${g.grupp}`}>
            <Rubrik>{g.rubrik}</Rubrik>
            <Gruppkort>
              {g.rader.map((r, i) => <TypRadKnapp key={r.nyckel} r={r} forsta={i === 0} ikon={r.markeringar[0] ? p.ikon(r.markeringar[0]) : <YtaIkon />} onTryck={() => oppnaTyp(r)} />)}
            </Gruppkort>
          </section>
        ))}

        {tomt && (
          <div data-testid="om-tomt" style={{ ...TYP.text, color: FARG.text2 }}>Inget är skrivet om trakten än. Vidas direktiv och planerarens text hamnar här, och allt som markerats på kartan listas efter typ.</div>
        )}
      </div>
    </>
  );
}

const radStil: React.CSSProperties = {
  width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m,
  background: 'transparent', border: 'none', color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...TYP.text,
};

const YtaIkon = () => <span aria-hidden="true" style={{ width: AVSTAND.xl + AVSTAND.xs, height: AVSTAND.xl + AVSTAND.xs, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: AVSTAND.l + AVSTAND.xs, height: AVSTAND.m, border: `2px solid ${FARG.text2}`, borderRadius: AVSTAND.xs }} /></span>;

/** En typrad: ikon, "Basväg" + resten dämpad ("· 3 st · 905 m"), pil. Högstubbar/evighetsträd med kravet: uppfyllt blir grönt med bock. */
function TypRadKnapp({ r, forsta, ikon, onTryck }: { r: TypRad; forsta: boolean; ikon: React.ReactNode; onTryck: () => void }) {
  const text = typRadText(r);
  const rest = text.slice(r.namn.length);   // " · 3 st · 905 m" (tom om raden bara är namnet)
  const uppfyllt = !!r.miljo && r.miljo.krav != null && r.miljo.uppfyllt;
  return (
    <button type="button" data-testid={`om-typ-${nyckelSlug(r.nyckel)}`} data-grupp={r.grupp as OmGrupp} data-uppfyllt={uppfyllt ? '1' : '0'} onClick={onTryck} className="press-row"
      style={{ ...radStil, borderTop: forsta ? 'none' : `1px solid ${FARG.linje}` }}>
      <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon}</span>
      <span data-testid="om-typ-text" style={{ flex: 1, minWidth: 0 }}>
        {/* Är raden för lång bryts den före siffrorna, aldrig mitt i dem eller före punkten: "Evighetsträd ·" / "0 av 73 markerade ✓". */}
        <span style={{ whiteSpace: 'nowrap' }}><span style={{ ...TYP.listtitel }}>{r.namn}</span><span style={{ color: FARG.text2 }}>{'\u00a0·'}</span></span>
        {rest && <>{' '}<span style={{ whiteSpace: 'nowrap', color: uppfyllt ? FARG.gron : FARG.text2, ...TNUM }}>{rest.slice(3)}{uppfyllt ? ' ✓' : ''}</span></>}
      </span>
      <Pil />
    </button>
  );
}

/**
 * Ett objekt i en lista (Faror, typvyn): symbolens namn (basväg: "Basväg röd · 640 m"), kommentaren som en rad under (högst två), foto som liten bild till höger, avstånd när man är på trakten.
 * Hela raden är tryckbar; vald rad har en ring och trycks den igen släpps framhävningen. Samma format för alla — kommentar och foto är extra rader, inte ett eget kort.
 */
function ObjektRad({ m, forsta, objektId, ikon, framhavdId, onVisa, onSlapp, onFoto }: {
  m: MarkeringMedAvstand; forsta: boolean; objektId: string | null; ikon: (m: KartMarkering) => React.ReactNode; framhavdId: string | null; onVisa: (m: KartMarkering) => void; onSlapp: () => void; onFoto: (src: string) => void;
}) {
  const framhavd = framhavdId === m.id;
  const komm = m.comment.trim();
  return (
    <div data-testid="om-objekt" data-id={m.id} data-framhavd={framhavd ? '1' : '0'} style={{ display: 'flex', alignItems: 'stretch', borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, boxShadow: framhavd ? `inset 0 0 0 2px ${FARG.text}` : 'none' }}>
      <button type="button" data-testid="om-objekt-knapp" onClick={() => (framhavd ? onSlapp() : onVisa(m))} className="press-row"
        style={{ ...radStil, flex: 1, minWidth: 0, width: 'auto', paddingTop: AVSTAND.m, paddingBottom: AVSTAND.m }}>
        <span style={{ flexShrink: 0, display: 'inline-flex' }}>{ikon(m)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span data-testid="om-huvudtext" style={{ display: 'block', ...TYP.listtitel, overflowWrap: 'anywhere' }}>{objektTitel(m)}</span>
          {komm && <span data-testid="om-kommentar" style={{ display: '-webkit-box', ...TYP.meta, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{komm}</span>}
        </span>
        {m.avstandM != null && <span data-testid="om-avstand" style={{ ...TYP.meta, color: FARG.text2, flexShrink: 0, ...TNUM }}>{avstandText(m.avstandM)}</span>}
        <Pil />
      </button>
      {harFoto(m) && (
        <span data-testid="om-foto" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', padding: `${AVSTAND.s}px ${AVSTAND.m}px ${AVSTAND.s}px 0` }}>
          <MarkeringFoto lokal={m.fotoVantar && objektId ? { objektId, markerId: m.id } : null} photoPath={m.photoPath} photoData={m.photoData} photoTs={m.photoTs} alt={`Foto: ${m.namn}`} onOpen={onFoto}
            style={{ width: AVSTAND.xxl + AVSTAND.s, height: AVSTAND.xxl + AVSTAND.s, objectFit: 'cover', borderRadius: RADIE.rad, display: 'block' }} />
        </span>
      )}
    </div>
  );
}
