'use client';

// MÅLBILDERNA I APPEN — sektionen "Så ska det se ut", den lilla bilden i larmkortet, bladet som öppnas från den och "Alla målbilder". Allt innehåll
// (bilder, rader, felbild, regler) kommer ur lib/malbilder.ts — ingen text eller bild står här. Ren presentation; bilderna är inbäddade SVG-strängar
// ur den filen, så inget laddas utifrån och allt fungerar utan täckning.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GRUPPER } from '@/lib/larm/grupper';
import { malbildInnehall, malbildKalla, MALBILDER, MALBILD_ORDNING, type Maskinroll, type Regelsida } from '@/lib/malbilder';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';

/** Bilden skalas till bredden och behåller sitt format. SVG-strängarna ligger i lib/malbilder.ts och är skrivna av oss, aldrig användardata. */
const MALBILD_CSS = '.malbild-svg svg{display:block;width:100%;height:auto}';

export function MalbildBild({ svg, rund = RADIE.kort, testid }: { svg: string; rund?: number; testid?: string }) {
  return (
    <>
      <style>{MALBILD_CSS}</style>
      <div className="malbild-svg" data-testid={testid} style={{ borderRadius: rund, overflow: 'hidden', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svg }} />
    </>
  );
}

/** Maskindatorn (1280×800) och iPad liggande: bred men låg skärm. Då ligger bilden bredvid raderna så bilden OCH "Inte så här" syns utan att scrolla;
 * bladet blir bredare. Telefon och iPad stående rörs inte (en kolumn som förut). */
const BRED_LAG = '@media (min-width: 900px) and (max-height: 900px)';
const MALBILD_BRED_CSS = `${BRED_LAG}{
  .mb-sektion{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);column-gap:${AVSTAND.l}px;align-items:start}
  .mb-sektion>*{grid-column:1/-1}
  .mb-sektion>.mb-bild{grid-column:1}
  .mb-sektion>.mb-rader{grid-column:2}
  .mb-fel{display:grid!important;grid-template-columns:200px minmax(0,1fr);column-gap:${AVSTAND.m}px;row-gap:${AVSTAND.xs}px;align-items:start}
  .mb-fel>:first-child{grid-column:1/-1}
  .mb-ark{max-width:880px!important}
}
/* Ännu lägre (Windows-skalning 125 % på maskindatorn: 1024×640): sortväljaren (Kulturlämning/Kolbotten) står på samma rad som etiketten i stället för ovanför bilden, bilden får högst 300 px (eller 43 % av raden), raderna och felbilden blir tätare. */
@media (min-width: 900px) and (max-height: 700px){
  .mb-sektion{grid-template-columns:minmax(0,min(300px,43%)) minmax(0,1fr)!important;row-gap:${AVSTAND.s}px!important}
  .mb-huvud{flex-direction:row!important;align-items:center;justify-content:space-between;gap:${AVSTAND.m}px!important}
  .mb-val{flex-wrap:nowrap!important}
  .mb-val>button{padding:0 ${AVSTAND.m}px!important}
  .mb-rader>li{min-height:${TRAFFYTA.min}px!important;padding-top:${AVSTAND.xs}px!important;padding-bottom:${AVSTAND.xs}px!important}
  .mb-fel{grid-template-columns:140px minmax(0,1fr)!important}
}`;

const micro: React.CSSProperties = { ...TYP.micro, color: FARG.text3 };
const prickFarg = (grupp: keyof typeof GRUPPER) => (grupp === 'info' ? FARG.text2 : GRUPPER[grupp].farg);

/**
 * Sektionen "Så ska det se ut" i KartKort: bilden stor, 2–3 rader, "Inte så här" liten under, och "Alla regler ›" när sorten har en regelsida.
 * Skiljer innehållet per maskintyp (`roll`) tar sektionen rollens bild, rader och felbild. Sorter utan målbild ger ingenting (null).
 */
export function MalbildSektion({ nyckel, roll, testid = 'malbild' }: { nyckel: string | null | undefined; roll?: Maskinroll | null; testid?: string }) {
  const m = nyckel ? MALBILDER[nyckel] : undefined;
  const [variant, setVariant] = useState<string | null>(null);
  const [regler, setRegler] = useState(false);
  if (!m) return null;
  const i = malbildInnehall(m.nyckel, roll, variant);
  if (!i) return null;
  const val = m.varianter?.length ? [{ nyckel: null as string | null, namn: m.standardNamn ?? m.namn }, ...m.varianter.map((v) => ({ nyckel: v.nyckel as string | null, namn: v.namn }))] : null;
  return (
    <section className="mb-sektion" data-testid={testid} data-malbild={m.nyckel} data-roll={roll ?? 'ingen'} data-variant={variant ?? ''} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <style>{MALBILD_BRED_CSS}</style>
      <div className="mb-huvud" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        <div style={micro}>Så ska det se ut</div>
        {val && (
          <div className="mb-val" role="group" aria-label="Vilken sort" style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
            {val.map((v) => {
              const vald = v.nyckel === variant;
              return (
                <button key={v.nyckel ?? 'standard'} type="button" data-testid={`malbild-variant-${v.nyckel ?? 'standard'}`} aria-pressed={vald} onClick={() => setVariant(v.nyckel)} className="press-dim"
                  style={{ ...(vald ? KNAPP.primar : KNAPP.sekundar), width: 'auto', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, fontFamily: 'inherit' }}>{v.namn}</button>
              );
            })}
          </div>
        )}
      </div>
      <div className="mb-bild"><MalbildBild svg={i.bild} testid="malbild-bild" /></div>
      <ul className="mb-rader" data-testid="malbild-rader" style={{ listStyle: 'none', margin: 0, padding: 0, background: FARG.upphojt, borderRadius: RADIE.kort, display: 'flex', flexDirection: 'column' }}>
        {i.rader.map((r, n) => (
          <li key={r} data-testid="malbild-rad" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: n === 0 ? 'none' : `1px solid ${FARG.linje}`, ...TYP.text, color: FARG.text }}>
            <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: prickFarg(m.grupp), flexShrink: 0 }} />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      <div className="mb-fel" data-testid="malbild-fel" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        <div style={{ ...micro, color: FARG.rod }}>Inte så här</div>
        <div style={{ maxWidth: 240 }}><MalbildBild svg={i.fel.bild} rund={RADIE.rad} testid="malbild-fel-bild" /></div>
        <div data-testid="malbild-fel-text" style={{ ...TYP.meta, color: FARG.text2 }}>{i.fel.text}</div>
      </div>
      {m.regler && (
        <button type="button" data-testid="malbild-alla-regler" onClick={() => setRegler(true)} className="press-dim"
          style={{ ...KNAPP.lank, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: TRAFFYTA.primar, width: '100%', padding: `0 ${AVSTAND.xs}px`, fontFamily: 'inherit', cursor: 'pointer' }}>
          <span>Alla regler</span><span aria-hidden="true">›</span>
        </button>
      )}
      {regler && m.regler && <MalbildRegler sida={m.regler} namn={m.namn} onTillbaka={() => setRegler(false)} />}
    </section>
  );
}

/** Överlägget (egen sida eller blad) ligger i body: kortet under har en transform, och en `fixed` inuti den skulle räknas från kortet i stället för skärmen. */
function Overlag({ onStang, z, children, testid, heltHog }: { onStang: () => void; z: number; children: React.ReactNode; testid: string; heltHog?: boolean }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div data-testid={testid} style={{ position: 'fixed', inset: 0, zIndex: z, background: heltHog ? FARG.bg : `${FARG.bg}80`, display: 'flex', alignItems: heltHog ? 'stretch' : 'flex-end', justifyContent: 'center' }} onClick={heltHog ? undefined : onStang}>
      <style>{designCss}{MALBILD_BRED_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className={heltHog ? undefined : 'mb-ark'}
        style={{
          width: '100%', maxWidth: 560, maxHeight: heltHog ? undefined : '92vh', height: heltHog ? '100%' : undefined, display: 'flex', flexDirection: 'column', background: FARG.kort,
          border: heltHog ? 'none' : `1px solid ${FARG.linje}`, borderBottom: 'none', borderTopLeftRadius: heltHog ? 0 : RADIE.sheet, borderTopRightRadius: heltHog ? 0 : RADIE.sheet, paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** "Alla regler ›": egen sida under kortet, med tillbaka-pil till kortet. */
export function MalbildRegler({ sida, namn, onTillbaka }: { sida: Regelsida; namn: string; onTillbaka: () => void }) {
  return (
    <Overlag onStang={onTillbaka} z={340} testid="malbild-regler" heltHog>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.m}px) ${AVSTAND.l}px ${AVSTAND.m}px`, flexShrink: 0 }}>
        <button type="button" data-testid="malbild-regler-tillbaka" aria-label={`Tillbaka till ${namn}`} onClick={onTillbaka} className="press-dim"
          style={{ ...KNAPP.sekundar, width: TRAFFYTA.min, minHeight: TRAFFYTA.min, padding: 0, fontFamily: 'inherit', flexShrink: 0 }}>
          <span aria-hidden="true" className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
        </button>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <div data-testid="malbild-regler-titel" style={{ ...TYP.rubrik, color: FARG.text }}>{sida.titel}</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{sida.underrubrik}</div>
        </div>
      </div>
      <div data-testid="malbild-regler-innehall" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.xs}px ${AVSTAND.l}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <MalbildBild svg={sida.bild} />
        {sida.block.map((b) => {
          if (b.slag === 'varning') {
            return (
              <div key={b.rubrik} data-testid="malbild-regler-varning" style={{ background: `${FARG.rod}29`, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                <div style={{ ...TYP.listtitel, color: FARG.rod }}>{b.rubrik}</div>
                <div style={{ ...TYP.text, color: FARG.text }}>{b.text}</div>
              </div>
            );
          }
          if (b.slag === 'rutor') {
            return (
              <div key={b.rubrik} data-testid="malbild-regler-rutor" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                <div style={{ ...micro, color: FARG.rod }}>{b.rubrik}</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${b.rutor.length}, 1fr)`, gap: AVSTAND.s }}>
                  {b.rutor.map((r) => (
                    <div key={r.varde} style={{ background: FARG.upphojt, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.m}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                      <span style={{ ...TYP.rubrik, color: FARG.text }}>{r.varde}</span>
                      <span style={{ ...TYP.meta, color: FARG.text2 }}>{r.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <div key={b.rubrik} data-testid="malbild-regler-grupp" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              <div style={micro}>{b.rubrik}</div>
              <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, display: 'flex', flexDirection: 'column' }}>
                {b.rader.map((r, n) => (
                  <div key={r.text} data-testid="malbild-regler-rad" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderTop: n === 0 ? 'none' : `1px solid ${FARG.linje}`, ...TYP.text, color: FARG.text }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{r.text}</span>
                    {r.varde && <span style={{ flexShrink: 0, ...TYP.listtitel }}>{r.varde}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ ...TYP.meta, color: FARG.text3 }}>{sida.kalla}</div>
        <button type="button" onClick={onTillbaka} className="press-dim" style={{ ...KNAPP.sekundar, fontFamily: 'inherit' }}>Tillbaka till {namn}</button>
      </div>
    </Overlag>
  );
}

/**
 * Bladet med bara målbilden: öppnas från den lilla bilden i larmkortet ("Visa"), från en rad i "Vad betyder kartan" och från "Alla målbilder".
 * `onSett` finns bara när bladet öppnats från ett larm som väntar på kvittering: samma "✓ Sett" som raden längst ner.
 */
/**
 * Källraden längst ner i bladet (under "Inte så här"): "Källa: <utgivare> · <ämne> ›". Bara en länk till utgivarens egen sida, öppnad i en ny flik — inga
 * kopierade bilder. Liten och grå, men med minst 44 px tryckyta. Utan källa i lib/malbilder (MALBILD_KALLA) finns ingen rad.
 */
export function MalbildKalla({ nyckel }: { nyckel: string }) {
  const k = malbildKalla(nyckel);
  if (!k) return null;
  return (
    <a data-testid="malbild-kalla" href={k.url} target="_blank" rel="noopener noreferrer"
      // window.open lämnar PWA:n levande på iOS (ett <a target="_blank"> kan navigera IN-PLACE och kall-starta appen vid retur); ankaret behålls som reserv.
      onClick={(e) => { e.preventDefault(); window.open(k.url, '_blank', 'noopener,noreferrer'); }}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, minHeight: TRAFFYTA.min, flexShrink: 0, ...TYP.meta, color: FARG.text2, textDecoration: 'none', fontFamily: 'inherit' }}>
      <span style={{ minWidth: 0 }}>Källa: {k.utgivare} · {k.amne}</span>
      <span aria-hidden="true">›</span>
    </a>
  );
}

export function MalbildBlad({ nyckel, roll, ikon, namn, onStang, onSett }: { nyckel: string; roll?: Maskinroll | null; ikon?: React.ReactNode; namn?: string; onStang: () => void; onSett?: () => void }) {
  const m = MALBILDER[nyckel];
  if (!m) return null;
  const g = GRUPPER[m.grupp];
  return (
    <Overlag onStang={onStang} z={330} testid="malbild-blad">
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `${AVSTAND.l}px ${AVSTAND.xl}px ${AVSTAND.s}px`, flexShrink: 0 }}>
        {ikon && <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex' }}>{ikon}</span>}
        <div data-testid="malbild-blad-namn" style={{ ...TYP.rubrik, color: FARG.text, minWidth: 0 }}>
          {namn ?? m.namn} <span style={{ color: m.grupp === 'info' ? FARG.text2 : g.farg }}>· {g.namn}</span>
        </div>
      </div>
      <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `${AVSTAND.xs}px ${AVSTAND.xl}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <MalbildSektion nyckel={nyckel} roll={roll} testid="malbild-blad-sektion" />
        <MalbildKalla nyckel={nyckel} />
      </div>
      {/* Foten ligger utanför det som scrollar: Sett och Stäng syns alltid, också när bilden är hög (maskindatorn 1280×800). */}
      <div data-testid="malbild-blad-fot" style={{ flexShrink: 0, display: 'flex', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.xl}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
        {onSett && (
          <button type="button" data-testid="malbild-blad-sett" onClick={onSett} className="press-dim" style={{ ...KNAPP.primar, flex: 2, width: 'auto', fontFamily: 'inherit' }}>✓ Sett</button>
        )}
        <button type="button" data-testid="malbild-blad-stang" onClick={onStang} className="press-dim" style={{ ...KNAPP.sekundar, flex: 1, width: 'auto', fontFamily: 'inherit' }}>Stäng</button>
      </div>
    </Overlag>
  );
}

/**
 * EN rad på KartKort: liten miniatyr av målbilden + "Så ska det se ut ›". Tryck öppnar bladet (bild, rader, "Inte så här", Sett/Stäng i foten). Målbilden ligger aldrig
 * utfälld i kortet — det som står om just den här punkten (kommentar, vem, när) ska synas först. Ger ingenting för en sort utan målbild (Fara, Info …).
 * Bladet ligger i body (portal) men är barn till kortet i React-trädet, så ett tryck i det stänger inte kortet (kortets panel stoppar händelsen).
 */
export function MalbildRad({ nyckel, roll, testid = 'malbild-rad-kort' }: { nyckel: string | null | undefined; roll?: Maskinroll | null; testid?: string }) {
  const [oppen, setOppen] = useState(false);
  const m = nyckel ? MALBILDER[nyckel] : undefined;
  const i = m ? malbildInnehall(m.nyckel, roll) : null;
  if (!m || !i) return null;
  return (
    <>
      <button type="button" data-testid={testid} data-malbild={m.nyckel} data-roll={roll ?? 'ingen'} onClick={() => setOppen(true)} className="press-dim"
        style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar, padding: `${AVSTAND.xs}px ${AVSTAND.m}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.kort, color: FARG.text, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' }}>
        <div style={{ width: MALBILD_MINIATYR_PX, flexShrink: 0 }}><MalbildBild svg={i.bild} rund={RADIE.rad} testid="malbild-miniatyr" /></div>
        <span style={{ flex: '1 1 auto', minWidth: 0, ...TYP.text }}>Så ska det se ut</span>
        <span aria-hidden="true" style={{ ...TYP.text, color: FARG.text2 }}>›</span>
      </button>
      {oppen && <MalbildBlad nyckel={m.nyckel} roll={roll} onStang={() => setOppen(false)} />}
    </>
  );
}
/** Bredden på miniatyren i kortets målbildsrad (höjden följer bildens format). */
export const MALBILD_MINIATYR_PX = 64;

/** Den lilla bilden i larmkortet: bild + "Så ska det se ut" + Visa. Ger ingenting för en sort utan målbild. */
export function MalbildLiten({ nyckel, roll, onVisa }: { nyckel: string | null | undefined; roll?: Maskinroll | null; onVisa: (nyckel: string) => void }) {
  const m = nyckel ? MALBILDER[nyckel] : undefined;
  const i = m ? malbildInnehall(m.nyckel, roll) : null;
  if (!m || !i) return null;
  return (
    <div data-testid="larm-malbild" data-malbild={m.nyckel} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, paddingTop: AVSTAND.s, borderTop: `1px solid ${FARG.linje}` }}>
      <div style={{ width: MALBILD_LITEN_PX, flexShrink: 0 }}><MalbildBild svg={i.bild} rund={RADIE.rad} testid="larm-malbild-bild" /></div>
      <span style={{ flex: '1 1 auto', minWidth: 0, ...TYP.text, color: FARG.text2 }}>Så ska det se ut</span>
      <button type="button" data-testid="larm-malbild-visa" onClick={() => onVisa(m.nyckel)} className="press-dim"
        style={{ ...KNAPP.sekundar, width: 'auto', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, flexShrink: 0, fontFamily: 'inherit' }}>Visa</button>
    </div>
  );
}
/** Bredden på den lilla bilden i larmkortet (höjden följer bildens format). */
export const MALBILD_LITEN_PX = 72;
/** Extra höjd (px) som raden ger larmkortet: sidans placering av kortet under (grindkortet) räknar med den. */
export const LARM_MALBILD_RAD_PX = 72;

/**
 * "Alla målbilder": listan längst ner i "Vad betyder kartan". Här når man också de sorter som inte går att sätta ut eller som appen ritar själv (Kolbotten, Kantzon,
 * Vattenskyddsområde). Tryck på en rad öppnar bladet.
 */
export function MalbildLista({ roll, onVisa }: { roll?: Maskinroll | null; onVisa: (nyckel: string) => void }) {
  void roll;
  return (
    <section data-testid="malbild-lista" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <div style={{ ...micro, padding: `0 ${AVSTAND.xs}px` }}>Så ska det se ut</div>
      <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, display: 'flex', flexDirection: 'column' }}>
        {MALBILD_ORDNING.map((n, k) => {
          const m = MALBILDER[n];
          return (
            <button key={n} type="button" data-testid={`malbild-lista-${n}`} onClick={() => onVisa(n)} className="press-dim"
              style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, border: 'none', borderTop: k === 0 ? 'none' : `1px solid ${FARG.linje}`, background: 'transparent', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', ...TYP.text }}>
              <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: prickFarg(m.grupp), flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{m.namn}</span>
              <span aria-hidden="true" style={{ color: FARG.bla }}>›</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
