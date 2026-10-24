'use client';

// ⓘ-KORTET (tavla 26/26b). Info och verktyg är skilda: kortet säger VAD trakten är och vad föraren ska veta; menyvalen bor i Mer.
//
//   Uppifrån: namn · Faror (röd rad, säkerhet står alltid överst) · TILL FÖRAREN (Vidas traktdirektiv i sin helhet, samma ruta som instruktionskortet) · Brandrisk · knapprad efter
//   roll (utan Mer) · faktabrickor · uppdraget: Instruktioner på trakten · På trakten · Vad betyder kartan · Dokument · Larmkoordinat · Mer (en rad, längst ner).
//
// Ren presentation: sidan bygger texterna (lib/objektKort) och bestämmer vad ett tryck gör.

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import type { SammanfattningRad } from '@/lib/klarTrakt';
import { type Bricka, type KortKnapp, type KortKnappId, type TillForarenPost } from '@/lib/objektKort';
import BrandriskRad from './BrandriskRad';
import { Gruppkort, Huvud, Pil, RadKnapp, Rubrik } from './infoDelar';
import { KommentarVisning } from './KommentarRuta';
import { SettKnapp } from './InstruktionKort';
import BesokPlanerare, { type BesokPlanerareProps } from '../besok/BesokPlanerare';

export interface KortLarm {
  satt: boolean;
  koordinat: string;
  bekraftad: boolean;
  /** "Larmplats kontrollerad / inte kontrollerad" — planerarens uppgift, så den visas bara i planeringsläget. Föraren ser koordinaten, inte kontrollstatusen. */
  visaKontroll: boolean;
  beskrivning: string;
  onVisa: () => void;
}

export interface ObjektKortProps {
  namn: string;
  rad: string;
  knappar: KortKnapp[];
  onKnapp: (id: KortKnappId) => void;
  onStang: () => void;
  faror: string[];
  /** Vidas traktdirektiv och planerarens texter, ALLTID i sin helhet (inget "Läs allt"). */
  tillForaren: TillForarenPost[];
  /** MASKINLÄGET: Vidas direktiv är instruktion nr 1 — "✓ Sett" under rutan medan det inte setts. Null/saknas = ingen knapp (planeringsvyn). */
  direktivSett?: { sedd: boolean; onSett: () => void } | null;
  /** "Mer" är en rad längst ner i uppdraget (inte en stor knapp högst upp): menyn med Körvy, Föraren, Planeraren, Övrigt och Avsluta objekt. */
  onMer: () => void;
  brickor: Bricka[];
  extraBrickor: Bricka[];
  /** "N markeringar · M med text" — null = inga markeringar (raden visas inte) */
  paTrakten: string | null;
  onPaTrakten: () => void;
  /** MASKINLÄGET: "Instruktioner på trakten (N) ›" — alla kommentarer per område, med förarens "✓ Sett". Saknas/null = ingen rad (planeringsvyn och trakter utan instruktioner). */
  instruktioner?: { antal: number; nya: number; onOppna: () => void } | null;
  /** "Vad betyder kartan ›" — öppnar teckenförklaringen. Saknas = ingen rad. */
  onKarta?: () => void;
  brand: { lat: number; lng: number } | null;
  onBrand: () => void;
  dokument: { antal: number; chips: React.ReactNode } | null;
  larm: KortLarm;
  /** "Klar med trakten?" — raden överst på planerarens kort medan trakten planeras. */
  /** FÖRARENS sammanfattning av planeringen: det planeraren fyllt i, utan Klar-knapp och utan redigering. null/saknas = visas inte (planerare ser kortet "Klar med trakten?" i stället). */
  planering?: { rader: SammanfattningRad[]; oplanerad: boolean; gamla: string } | null;
  klarRad?: { chip: { text: string; ton: 'orange' | 'gron' | 'neutral' } | null } | null;
  onKlar?: () => void;
  /** Besök på trakten (planerarens kort): SMS till markägaren, besökslänken och loggen. null/saknas = visas inte (förare, maskinläget). */
  besok?: BesokPlanerareProps | null;
  /** Skotarläget: vädret de närmaste dagarna (bara här — inget väder på kartan). Sist på kortet. */
  vader?: React.ReactNode;
}

export default function ObjektKort(p: ObjektKortProps) {
  const [dokOppen, setDokOppen] = useState(false);
  const n = p.knappar.length;
  // Alla knappar på EN rad. Fyra (förare) kräver tätare: 4 px mellanrum och ingen sidopadding ger 79 px per knapp på en 360 px bred telefon — "Skotning" är 73 px.
  const kolumner = Math.max(1, n);
  const tat = n >= 4;
  const alla = [...p.brickor, ...p.extraBrickor];

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.rad || undefined} onStang={p.onStang} />
      <div data-testid="kort-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {/* FAROR — röd rad med ord (färg är aldrig ensam bärare) */}
        {p.faror.length > 0 && (
          <div data-testid="kort-faror" role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>Faror: {p.faror.join(', ')}</span>
          </div>
        )}

        {/* TILL FÖRAREN — Vidas traktdirektiv och planerarens texter, HÖGST UPP (efter Faror-raden: säkerhet står alltid överst) och ALLTID i sin helhet: aldrig avklippt, inget "Läs allt".
            SAMMA ruta som instruktionskortet och kartkortet (KommentarRuta): ljusare ruta, 19 px text, blå "Vida · traktdirektiv". Vidas direktiv är löptext utan radbrytningar och delas
            i numrerade punkter vid meningsslut; planerarens text delas bara på radbrytning. I maskinläget är Vidas direktiv instruktion nr 1: "✓ Sett" under rutan tills det setts. */}
        {p.tillForaren.length > 0 && (
          <div data-testid="kort-till-foraren" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, marginBottom: AVSTAND.l }}>
            {p.tillForaren.map((t) => {
              const vida = t.id === 'vida';
              return (
                <div key={t.id} data-testid={`kort-post-${t.id}`}>
                  <KommentarVisning vida={vida} etikett={t.avsandare} text={t.text} meningar={vida} />
                  {vida && p.direktivSett && !p.direktivSett.sedd && (
                    <div style={{ marginTop: AVSTAND.s }}><SettKnapp testid="kort-direktiv-sett" onSett={p.direktivSett.onSett} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* BRANDRISK — bara när någon av de fem dagarna är 3 eller högre; direkt under Faror */}
        {p.brand && <BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} luftUnder={AVSTAND.m} />}

        {/* KLAR MED TRAKTEN? — planerarens ingång till färdigplaneringen; "N kvar" i orange, "Klar" i grönt (ord och färg tillsammans) */}
        {p.klarRad && p.onKlar && (
          <div style={{ marginBottom: AVSTAND.m }}>
            <Gruppkort testid="kort-klar">
              <RadKnapp forstaRad testid="kort-klar-rad" etikett="Klar med trakten?" onTryck={p.onKlar}
                hoger={p.klarRad.chip ? <span data-testid="kort-klar-chip" data-ton={p.klarRad.chip.ton} style={{ ...TYP.listtitel, color: p.klarRad.chip.ton === 'orange' ? FARG.orange : p.klarRad.chip.ton === 'gron' ? FARG.gron : FARG.text }}>{p.klarRad.chip.text}</span> : undefined} />
            </Gruppkort>
          </div>
        )}

        {/* KNAPPRAD efter roll — högst EN primär: den första. "Mer" ligger inte här: den är en rad längst ner i uppdraget. Inga knappar = ingen rad. */}
        {n > 0 && <div data-testid="kort-knappar" style={{ display: 'grid', gridTemplateColumns: `repeat(${kolumner}, minmax(0, 1fr))`, gap: tat ? AVSTAND.xs : AVSTAND.s, marginBottom: AVSTAND.l }}>
          {p.knappar.map((k, i) => (
            <button key={k.id} type="button" data-testid={`kort-knapp-${k.id}`} onClick={() => p.onKnapp(k.id)} className="press-scale"
              style={{ ...(i === 0 ? KNAPP.primar : KNAPP.sekundar), minHeight: TRAFFYTA.primar, ...(tat ? { padding: 0, whiteSpace: 'nowrap', overflow: 'hidden' } : null), cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
              {k.etikett}
            </button>
          ))}
        </div>}

        {/* PLANERING — det planeraren fyllt i. Bara läsning: ingen Klar-knapp, inget att ändra. Vidas direktiv står ovanför. */}
        {p.planering && (p.planering.rader.length > 0 || p.planering.oplanerad || p.planering.gamla.trim()) && (
          <div data-testid="kort-planering" style={{ marginBottom: AVSTAND.l }}>
            <Rubrik>Planering</Rubrik>
            <Gruppkort>
              {p.planering.oplanerad && (
                <div data-testid="kort-planering-oplanerad" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, ...TYP.listtitel, color: FARG.orange }}>Inte klarplanerad än — uppgifterna kan saknas eller ändras</div>
              )}
              {p.planering.rader.map((r, i) => (
                <div key={r.id} data-testid={`kort-planering-${r.id}`} style={{ display: 'flex', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: i === 0 && !p.planering!.oplanerad ? 'none' : `1px solid ${FARG.linje}` }}>
                  <span style={{ ...TYP.text, color: FARG.text2, flexShrink: 0, width: '42%' }}>{r.etikett}</span>
                  <span style={{ ...TYP.text, color: FARG.text, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.text}</span>
                </div>
              ))}
              {p.planering.gamla.trim() && (
                <div data-testid="kort-planering-gamla" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: p.planering.rader.length > 0 || p.planering.oplanerad ? `1px solid ${FARG.linje}` : 'none' }}>
                  <div style={{ ...TYP.meta, color: FARG.text3 }}>Gamla anteckningar</div>
                  <div style={{ ...TYP.text, color: FARG.text2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.planering.gamla.trim()}</div>
                </div>
              )}
            </Gruppkort>
          </div>
        )}

        {/* FAKTABRICKOR — bara det som har värde */}
        {alla.length > 0 && (
          <div data-testid="kort-brickor" style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s, marginBottom: AVSTAND.l }}>
            {alla.map((b) => (
              <div key={b.id} data-testid={`kort-bricka-${b.id}`} style={{ padding: `${AVSTAND.s}px ${AVSTAND.m}px`, borderRadius: RADIE.rad, background: FARG.fyllning }}>
                <span style={{ ...TYP.listtitel, color: FARG.text, ...TNUM }}>{b.varde}</span>
                {b.etikett && <span style={{ ...TYP.meta, color: FARG.text2 }}> {b.etikett}</span>}
              </div>
            ))}
          </div>
        )}

        {/* BESÖK PÅ TRAKTEN — bara planeraren: SMS till markägaren, länken till besökssidan och loggen över anmälningar */}
        {p.besok && <BesokPlanerare {...p.besok} />}

        {/* UPPDRAGET: På trakten · Brandrisk · Dokument · Larmkoordinat */}
        <Gruppkort testid="kort-uppdrag">
          {p.instruktioner && p.instruktioner.antal > 0 && (
            <RadKnapp forstaRad testid="kort-instruktioner" etikett={`Instruktioner på trakten (${p.instruktioner.antal})`} onTryck={p.instruktioner.onOppna}
              hoger={p.instruktioner.nya > 0 ? <span data-testid="kort-instruktioner-nya" style={{ ...TYP.listtitel, color: FARG.text }}>{p.instruktioner.nya} {p.instruktioner.nya === 1 ? 'ny' : 'nya'}</span> : undefined} />
          )}
          {p.paTrakten && (
            <RadKnapp forstaRad={!(p.instruktioner && p.instruktioner.antal > 0)} testid="kort-pa-trakten" etikett={`På trakten · ${p.paTrakten}`} onTryck={p.onPaTrakten} />
          )}
          {p.onKarta && (
            <RadKnapp forstaRad={!p.paTrakten && !(p.instruktioner && p.instruktioner.antal > 0)} testid="kort-vad-betyder-kartan" etikett="Vad betyder kartan" onTryck={p.onKarta} />
          )}
          {p.dokument && (
            <>
              <RadKnapp testid="kort-dokument" ikon="description" etikett={`Dokument (${p.dokument.antal})`} onTryck={() => setDokOppen((v) => !v)}
                pil={false} hoger={<span style={{ display: 'inline-flex', transform: dokOppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>} />
              {dokOppen && <div data-testid="kort-dokument-lista" style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>{p.dokument.chips}</div>}
            </>
          )}
          <LarmKort larm={p.larm} />
          <RadKnapp testid="kort-mer" etikett="Mer" under="Fler val och inställningar" onTryck={p.onMer} />
        </Gruppkort>
        {p.vader && <div data-testid="kort-vader" style={{ marginTop: AVSTAND.l }}>{p.vader}</div>}
      </div>
    </>
  );
}

/** Larmkoordinaten är säkerhet: alltid synlig. Satt = tryck flyger kartan dit; ej satt = ärlig varning (farligare att dölja än att visa). */
function LarmKort({ larm }: { larm: KortLarm }) {
  if (!larm.satt) {
    return (
      <div data-testid="kort-larm" data-satt="0" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderTop: `1px solid ${FARG.linje}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, ...TYP.listtitel, color: FARG.orange }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad }}>warning</span>Larmkoordinat ej satt
        </div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Ingen mötesplats för räddningstjänsten är angiven. Sätt den under Mer › Trakt › Larm.</div>
        {larm.beskrivning && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap' }}>{larm.beskrivning}</div>}
      </div>
    );
  }
  return (
    <button type="button" data-testid="kort-larm" data-satt="1" onClick={larm.onVisa} className="press-row" aria-label="Visa larmkoordinaten på kartan"
      style={{ width: '100%', display: 'block', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: 'transparent', border: 'none', borderTop: `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>Larmkoordinat</span>
          <span style={{ display: 'block', ...TYP.listtitel, ...TNUM, overflowWrap: 'anywhere' }}>{larm.koordinat}</span>
          {larm.visaKontroll && <span data-testid="kort-larm-status" style={{ display: 'block', ...TYP.meta, color: larm.bekraftad ? FARG.gron : FARG.orange }}>{larm.bekraftad ? 'Larmplats kontrollerad' : 'Larmplats inte kontrollerad'}</span>}
        </span>
        <Pil />
      </span>
      {larm.beskrivning && <span style={{ display: 'block', marginTop: AVSTAND.s, ...TYP.text, whiteSpace: 'pre-wrap' }}>{larm.beskrivning}</span>}
    </button>
  );
}
