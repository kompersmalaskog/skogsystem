'use client';

// KORTET PÅ KARTAN — EN komponent för ALLT man kan trycka på: egna symboler, linjer och ytor och Vidas objekt (Kraftledning, hänsynsytor, avlägg …). Samma
// uppbyggnad överallt så att korten aldrig kan se olika ut:
//
//   [ikon]  Namn · Grupp           ← "Kraftledning · Fara"
//           Larmar alltid          ← larmregeln i klartext (lib/larm/grupper: larmRegelText)
//           EN mening              ← samma text som teckenförklaringen (lib/symboler)
//   <delar>                        ← det som är särskilt för typen (vägens färg, Vidas text, traktanalys …)
//   Kommentar                      ← går att skriva och ändra; visas i larmkortet
//   Foton                          ← går att lägga till
//   <atgarder>                     ← flytta, radera, ljud …
//   Stäng
//
// Komponenten äger bara UTSEENDET och redigeringsläget. Var kommentaren och fotona sparas bestämmer anroparen: egna markeringar sparar i markeringen
// (planering_markeringar, via markeringssynken), Vidas objekt hos OSS (objekt_yta_anteckning och objekt_yta_media, kopplade till objekt_id + Vida-objektets
// nyckel, lib/vidaNycklar) — Vidas egen data ändras aldrig.

import React, { useEffect, useRef, useState } from 'react';
import { GRUPPER, type FargGrupp } from '@/lib/larm/grupper';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';

/** Svepet nedåt (px) som stänger kortet. */
const SVEP_STANG_PX = 100;

export interface KartKortFoto {
  id: string;
  /** Själva bilden (så att egna markeringar kan använda sin fotokomponent och Vidas objekt en vanlig bild). */
  node: React.ReactNode;
  text?: string | null;
  /** Bildtexten går att ändra (sparas när fältet lämnas). */
  onSparaText?: (text: string) => void;
  /** Bara när fotot går att ta bort. */
  onTaBort?: () => void;
}

export interface KartKortProps {
  /** Symbolens/linjens/ytans ikon — samma bild som på kartan. */
  ikon: React.ReactNode;
  namn: string;
  grupp: FargGrupp;
  /** "Larmar alltid" / "Larmar tills du kvitterat" / "Larmar inte" (`larmRegelText`). */
  larmRegel: string;
  /** EN mening om vad det är. */
  mening: string | null;
  /** Varifrån objektet kommer, t.ex. "Vida" — liten rad under meningen. */
  kalla?: string | null;
  /** Kommentaren. `null` = kortet har ingen kommentarsplats (objekt utan stabil nyckel kan inte spara någon). */
  kommentar: { text: string; meta?: string | null } | null;
  kanSkriva: boolean;
  /** Sparar kommentaren; returnerar ett felmeddelande, eller null när det gick bra. */
  onSparaKommentar?: (text: string) => Promise<string | null> | string | null;
  foton: KartKortFoto[];
  /** Visas när fotot går att lägga till. */
  onLaggTillFoto?: () => void;
  fotoSparar?: boolean;
  fotoFel?: string | null;
  onStang: () => void;
  /** Det som är särskilt för typen (vägens färg, Vidas text, traktanalys …) — mellan meningen och kommentaren. Det som ska stå NEDERST (åtgärder, ljud, vägkontroll …),
   *  under fotona, läggs i <KartKortNederst>. */
  children?: React.ReactNode;
  testid?: string;
}

/** Markerar det som ska stå under fotona (åtgärder, ljud, vägkontroll …). */
export function KartKortNederst({ children }: { children?: React.ReactNode }) { return <>{children}</>; }

export function KartKort(p: KartKortProps) {
  const g = GRUPPER[p.grupp];
  const barn = React.Children.toArray(p.children);
  const arNederst = (c: React.ReactNode) => React.isValidElement(c) && c.type === KartKortNederst;
  const delar = barn.filter((c) => !arNederst(c));
  const nederst = barn.filter(arNederst);
  const [svepY, setSvepY] = useState(0);
  const svepStart = useRef<number | null>(null);
  return (
    <div
      data-testid={p.testid ?? 'kartkort'}
      data-grupp={p.grupp}
      style={{ position: 'fixed', inset: 0, background: `${FARG.bg}40`, zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={p.onStang}
    >
      <style>{designCss}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: FARG.kort, border: `1px solid ${FARG.linje}`, borderBottom: 'none',
          borderTopLeftRadius: RADIE.sheet, borderTopRightRadius: RADIE.sheet, paddingBottom: 'env(safe-area-inset-bottom, 0px)', transform: `translateY(${svepY}px)`,
          transition: svepStart.current == null ? 'transform 0.25s cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}
      >
        {/* Grepp: svep nedåt stänger */}
        <div
          style={{ flexShrink: 0, padding: `${AVSTAND.m}px 0 ${AVSTAND.s}px`, display: 'flex', justifyContent: 'center', touchAction: 'none' }}
          onTouchStart={(e) => { svepStart.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (svepStart.current != null) setSvepY(Math.max(0, e.touches[0].clientY - svepStart.current)); }}
          onTouchEnd={() => { const y = svepY; svepStart.current = null; if (y > SVEP_STANG_PX) p.onStang(); else setSvepY(0); }}
        >
          <div style={{ width: 40, height: 5, borderRadius: RADIE.rad, background: FARG.text3 }} />
        </div>

        <div style={{ overflowY: 'auto', padding: `${AVSTAND.xs}px ${AVSTAND.xl}px ${AVSTAND.xl}px`, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
          {/* Huvud: ikon, "Namn · Grupp", larmregel, EN mening */}
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l }}>
            <span data-testid="kartkort-ikon" style={{ flexShrink: 0, display: 'flex' }}>{p.ikon}</span>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <div data-testid="kartkort-namn" style={{ ...TYP.rubrik, color: FARG.text }}>
                {p.namn} <span style={{ color: p.grupp === 'info' ? FARG.text2 : g.farg }}>· {g.namn}</span>
              </div>
              <div data-testid="kartkort-larmregel" style={{ ...TYP.meta, color: FARG.text2 }}>{p.larmRegel}</div>
            </div>
          </div>
          {p.mening && <div data-testid="kartkort-mening" style={{ ...TYP.text, color: FARG.text2 }}>{p.mening}</div>}
          {p.kalla && <div data-testid="kartkort-kalla" style={{ ...TYP.micro, color: FARG.text3 }}>{p.kalla}</div>}

          {delar}

          {p.kommentar && <KartKortKommentar text={p.kommentar.text} meta={p.kommentar.meta ?? null} kanSkriva={p.kanSkriva} onSpara={p.onSparaKommentar} />}

          {(p.foton.length > 0 || (p.kanSkriva && p.onLaggTillFoto)) && (
            <KartKortFoton foton={p.foton} onLaggTill={p.kanSkriva ? p.onLaggTillFoto : undefined} sparar={p.fotoSparar} fel={p.fotoFel} />
          )}

          {nederst}

          <button type="button" onClick={p.onStang} data-testid="kartkort-stang" className="press-dim" style={{ ...KNAPP.sekundar }}>Stäng</button>
        </div>
      </div>
    </div>
  );
}

const rubrik: React.CSSProperties = { ...TYP.micro, color: FARG.text3, marginBottom: AVSTAND.s };
const knappLiten: React.CSSProperties = { ...KNAPP.sekundar, width: 'auto', minHeight: TRAFFYTA.min };

/** Kommentaren: text eller "Ingen kommentar"; den som får skriva ändrar den här, på plats. */
export function KartKortKommentar({ text, meta, kanSkriva, onSpara }: { text: string; meta: string | null; kanSkriva: boolean; onSpara?: (t: string) => Promise<string | null> | string | null }) {
  const [skriver, setSkriver] = useState(false);
  const [utkast, setUtkast] = useState(text);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  // Följer den sparade texten när något annat ändrar den (annan enhet, hämtning) medan man inte skriver.
  useEffect(() => { if (!skriver) setUtkast(text); }, [text, skriver]);
  const harText = text.trim().length > 0;
  const redigerbar = kanSkriva && !!onSpara;

  const spara = async () => {
    if (!onSpara) return;
    setSparar(true); setFel(null);
    let svar: string | null;
    try { svar = await onSpara(utkast.trim()); } catch (e) { svar = String((e as any)?.message ?? e); }
    setSparar(false);
    if (svar) { setFel(svar); return; }
    setSkriver(false);
  };

  return (
    <div data-testid="kartkort-kommentar">
      <div style={rubrik}>Kommentar</div>
      {skriver ? (
        <>
          <textarea
            data-testid="kartkort-kommentar-falt" value={utkast} onChange={(e) => setUtkast(e.target.value)} autoFocus placeholder="Skriv en kommentar…" rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.m, borderRadius: RADIE.kort, background: FARG.fyllning, border: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.text, fontFamily: 'inherit', resize: 'vertical' }}
          />
          {fel && <div data-testid="kartkort-kommentar-fel" style={{ ...TYP.meta, color: FARG.rod, marginTop: AVSTAND.s }}>{fel}</div>}
          <div style={{ display: 'flex', gap: AVSTAND.m, marginTop: AVSTAND.m }}>
            <button type="button" data-testid="kartkort-kommentar-spara" disabled={sparar} onClick={spara} className="press-dim" style={{ ...KNAPP.primar, flex: 1, opacity: sparar ? 0.5 : 1 }}>{sparar ? 'Sparar…' : 'Spara'}</button>
            <button type="button" data-testid="kartkort-kommentar-avbryt" disabled={sparar} onClick={() => { setSkriver(false); setUtkast(text); setFel(null); }} className="press-dim" style={knappLiten}>Avbryt</button>
          </div>
        </>
      ) : (
        <>
          {harText
            ? <div data-testid="kartkort-kommentar-text" style={{ ...TYP.text, color: FARG.text, whiteSpace: 'pre-wrap' }}>{text}</div>
            : <div data-testid="kartkort-kommentar-tom" style={{ ...TYP.text, color: FARG.text3 }}>Ingen kommentar</div>}
          {harText && meta && <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xs }}>{meta}</div>}
          {redigerbar && (
            <button type="button" data-testid="kartkort-kommentar-andra" onClick={() => { setUtkast(text); setSkriver(true); setFel(null); }} className="press-dim" style={{ ...knappLiten, marginTop: AVSTAND.m }}>
              {harText ? 'Ändra kommentar' : 'Lägg till kommentar'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Fotona: bilderna, en bildtext om det finns en, och "Lägg till foto" för den som får. */
export function KartKortFoton({ foton, onLaggTill, sparar, fel }: { foton: KartKortFoto[]; onLaggTill?: () => void; sparar?: boolean; fel?: string | null }) {
  return (
    <div data-testid="kartkort-foton">
      <div style={rubrik}>Foto</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {foton.map((f) => (
          <div key={f.id} data-testid="kartkort-foto" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: AVSTAND.s }}>
              <div style={{ flex: 1, minWidth: 0, borderRadius: RADIE.kort, overflow: 'hidden' }}>{f.node}</div>
              {f.onTaBort && (
                <button type="button" aria-label="Ta bort foto" data-testid="kartkort-foto-ta-bort" onClick={f.onTaBort} className="press-dim"
                  style={{ ...KNAPP.sekundar, width: TRAFFYTA.min, padding: 0, color: FARG.rod }}>✕</button>
              )}
            </div>
            {f.onSparaText ? (
              <input type="text" defaultValue={f.text ?? ''} placeholder="Bildtext…" key={`${f.id}-${f.text ?? ''}`} data-testid="kartkort-foto-text"
                onBlur={(e) => { if ((f.text ?? '') !== e.target.value.trim()) f.onSparaText?.(e.target.value); }}
                style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.s, borderRadius: RADIE.kort, background: FARG.fyllning, border: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.meta, fontFamily: 'inherit' }} />
            ) : f.text ? <div style={{ ...TYP.meta, color: FARG.text2 }}>{f.text}</div> : null}
          </div>
        ))}
        {foton.length === 0 && !onLaggTill && <div style={{ ...TYP.text, color: FARG.text3 }}>Inget foto</div>}
        {fel && <div data-testid="kartkort-foto-fel" style={{ ...TYP.meta, color: FARG.rod }}>{fel}</div>}
        {onLaggTill && (
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
            <button type="button" data-testid="kartkort-foto-lagg-till" disabled={sparar} onClick={onLaggTill} className="press-dim" style={{ ...knappLiten, opacity: sparar ? 0.5 : 1 }}>
              {foton.length > 0 ? 'Byt foto' : 'Lägg till foto'}
            </button>
            {sparar && <span style={{ ...TYP.meta, color: FARG.text2 }}>Laddar upp…</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default KartKort;
