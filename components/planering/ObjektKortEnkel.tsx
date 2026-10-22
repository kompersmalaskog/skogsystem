'use client';

// ⓘ-KORTET FÖR FÖRAREN I MASKINLÄGET — bara tre delar, så att ett barn förstår direkt (Martin 2026-10-22, skiss tavla 42–43):
//
//   1. Överst: traktens namn (stort) + "Slutavverkning · 2,5 av 5,2 ha klart" + grön stapel. ✕ i hörnet.
//   2. "Det här gäller här" (vanlig rubrik, inte små versaler): Faror (röda, först) · GROT (bara om trakten har GROT) · Vidas traktdirektiv "Hela trakten · Vida" med numrerade punkter ·
//      en rad per yta med KARTANS namn som bricka (lib/ytaRader) — osedda med en liten blå prick. Ett tryck på en yta flyger kartan dit.
//   3. Längst ner, EN grupp rader: "Om något händer – ring 112" med larmkoordinaten · Kartans färger · Dokument (N) · Mer.
//
// Bort för föraren (finns kvar i planeringsläget, `ObjektKort`): m³-chip och produktionssiffror (finns som lager) och "På trakten · N markeringar".
// Brandrisk (bara klass 3+), knappraden (bara när det finns knappar) och skotarens väder är säkerhet/funktion och står kvar när de har något att säga.
//
// Ren presentation: sidan bygger texterna och bestämmer vad ett tryck gör. Bara tokens.

import React, { useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { type KortKnapp, type KortKnappId, type TillForarenPost } from '@/lib/objektKort';
import type { YtaRad } from '@/lib/ytaRader';
import BrandriskRad from './BrandriskRad';
import { Gruppkort, Huvud, Pil, RadKnapp } from './infoDelar';
import { SettKnapp } from './InstruktionKort';
import { KommentarVisning } from './KommentarRuta';
import { YtaRadVy } from './YtaRad';

export interface ObjektKortEnkelProps {
  namn: string;
  /** "Slutavverkning · 2,5 av 5,2 ha klart" (lib/objektKort.framstegRad). */
  under: string;
  /** 0..1 = grön stapel under namnet; null = ingen stapel (inget mätt). */
  andel: number | null;
  onStang: () => void;
  faror: string[];
  /** "GROT tas ut – lägg riset i högar" / "… kör inte på rishögarna" (lib/objektKort.grotRad); null = ingen rad. */
  grot: string | null;
  /** Vidas traktdirektiv (och planerarens texter) — gäller hela trakten, alltid i sin helhet. */
  tillForaren: TillForarenPost[];
  /** Direktivet är instruktion nr 1: "✓ Sett" under rutan tills det setts. */
  direktivSett?: { sedd: boolean; onSett: () => void } | null;
  brand: { lat: number; lng: number } | null;
  onBrand: () => void;
  /** En rad per yta (lib/ytaRader). */
  ytor: YtaRad[];
  onYta: (nyckel: string) => void;
  knappar: KortKnapp[];
  onKnapp: (id: KortKnappId) => void;
  larm: { satt: boolean; koordinat: string; beskrivning: string; onVisa: () => void };
  onKarta?: () => void;
  dokument: { antal: number; chips: React.ReactNode } | null;
  onMer: () => void;
  vader?: React.ReactNode;
}

/** Den gröna stapeln: hur stor del av trakten som är klar. Ord och tal står bredvid (under namnet) — färgen är aldrig ensam. */
function Stapel({ andel }: { andel: number }) {
  const pct = Math.round(andel * 100);
  return (
    <div data-testid="kort-stapel" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Klart på trakten"
      style={{ height: AVSTAND.s, borderRadius: RADIE.rad, background: FARG.fyllning, overflow: 'hidden', margin: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
      <div data-testid="kort-stapel-fyll" style={{ width: `${pct}%`, height: '100%', borderRadius: RADIE.rad, background: FARG.gron }} />
    </div>
  );
}

const Ruta = ({ children, testid }: { children: React.ReactNode; testid: string }) => (
  <div data-testid={testid} role="note" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>{children}</div>
);

export default function ObjektKortEnkel(p: ObjektKortEnkelProps) {
  const [dokOppen, setDokOppen] = useState(false);
  const n = p.knappar.length;
  const harInnehall = p.faror.length > 0 || !!p.grot || p.tillForaren.length > 0 || p.ytor.length > 0 || !!p.brand;

  return (
    <>
      <Huvud titel={p.namn} undertitel={p.under} onStang={p.onStang} />
      {p.andel != null && <Stapel andel={p.andel} />}
      <div data-testid="kort-innehall" data-enkel="ja" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
        {/* DET HÄR GÄLLER HÄR — vanlig rubrik (inte små versaler) */}
        <h2 data-testid="kort-galler-rubrik" style={{ ...TYP.rubrik, color: FARG.text, margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.m}px` }}>Det här gäller här</h2>

        {p.faror.length > 0 && (
          <Ruta testid="kort-faror">
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.rod, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.listtitel, color: FARG.rod, overflowWrap: 'anywhere' }}>Faror: {p.faror.join(', ')}</span>
          </Ruta>
        )}

        {p.brand && <BrandriskRad lat={p.brand.lat} lng={p.brand.lng} onOppna={p.onBrand} luftUnder={AVSTAND.m} />}

        {p.grot && (
          <Ruta testid="kort-grot">
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: IKON.rad, color: FARG.text, flexShrink: 0 }}>forest</span>
            <span style={{ ...TYP.listtitel, overflowWrap: 'anywhere' }}>{p.grot}</span>
          </Ruta>
        )}

        {/* Vidas traktdirektiv gäller hela trakten (ingen flygning): etiketten säger det, punkterna är numrerade. Planerarens texter står under, märkta med avsändaren. */}
        {p.tillForaren.length > 0 && (
          <div data-testid="kort-till-foraren" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, marginBottom: AVSTAND.m }}>
            {p.tillForaren.map((t) => {
              const vida = t.id === 'vida';
              return (
                <div key={t.id} data-testid={`kort-post-${t.id}`}>
                  <KommentarVisning vida={vida} etikett={vida ? undefined : `Hela trakten · ${t.avsandare}`} vidaEtikett="Hela trakten · Vida" text={t.text} meningar={vida} />
                  {vida && p.direktivSett && !p.direktivSett.sedd && (
                    <div style={{ marginTop: AVSTAND.s }}><SettKnapp testid="kort-direktiv-sett" onSett={p.direktivSett.onSett} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* EN RAD PER YTA — kartans namn som bricka, typen och första punkten på en rad. Tryck = kartan flyger dit. */}
        {p.ytor.length > 0 && (
          <div style={{ marginBottom: AVSTAND.l }}>
            <Gruppkort testid="kort-ytor">
              {p.ytor.map((r, i) => <YtaRadVy key={r.nyckel} rad={r} onTryck={p.onYta} forstaRad={i === 0} />)}
            </Gruppkort>
          </div>
        )}
        {!harInnehall && <div data-testid="kort-galler-tomt" style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.l }}>Inget särskilt att tänka på här.</div>}

        {/* Knapprad bara när det finns knappar (skotare utan lassläge; skördaren i körvyn har inga) */}
        {n > 0 && (
          <div data-testid="kort-knappar" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))`, gap: AVSTAND.s, marginBottom: AVSTAND.l }}>
            {p.knappar.map((k, i) => (
              <button key={k.id} type="button" data-testid={`kort-knapp-${k.id}`} onClick={() => p.onKnapp(k.id)} className="press-scale"
                style={{ ...(i === 0 ? KNAPP.primar : KNAPP.sekundar), minHeight: TRAFFYTA.primar, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                {k.etikett}
              </button>
            ))}
          </div>
        )}

        {/* LÄNGST NER — en grupp rader: 112 med larmkoordinaten · Kartans färger · Dokument · Mer */}
        <Gruppkort testid="kort-uppdrag">
          {p.larm.satt ? (
            <RadKnapp forstaRad testid="kort-larm" etikett="Om något händer – ring 112" onTryck={p.larm.onVisa}
              under={<span data-testid="kort-larm-koordinat" style={TNUM}>Larmkoordinat {p.larm.koordinat}</span>} />
          ) : (
            <div data-testid="kort-larm" data-satt="0" style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
              <div style={{ ...TYP.text }}>Om något händer – ring 112</div>
              <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>Larmkoordinat ej satt</div>
              {p.larm.beskrivning && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap' }}>{p.larm.beskrivning}</div>}
            </div>
          )}
          {p.larm.satt && p.larm.beskrivning && <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px`, ...TYP.text, whiteSpace: 'pre-wrap' }}>{p.larm.beskrivning}</div>}
          {p.onKarta && <RadKnapp testid="kort-vad-betyder-kartan" etikett="Kartans färger" onTryck={p.onKarta} />}
          {p.dokument && (
            <>
              <RadKnapp testid="kort-dokument" etikett={`Dokument (${p.dokument.antal})`} onTryck={() => setDokOppen((v) => !v)}
                pil={false} hoger={<span style={{ display: 'inline-flex', transform: dokOppen ? 'rotate(90deg)' : 'none' }}><Pil /></span>} />
              {dokOppen && <div data-testid="kort-dokument-lista" style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>{p.dokument.chips}</div>}
            </>
          )}
          <RadKnapp testid="kort-mer" etikett="Mer" under="Fler val och inställningar" onTryck={p.onMer} />
        </Gruppkort>
        {p.vader && <div data-testid="kort-vader" style={{ marginTop: AVSTAND.l }}>{p.vader}</div>}
      </div>
    </>
  );
}
