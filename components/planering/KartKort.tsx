'use client';

// KORTET PÅ KARTAN — EN komponent för ALLT man kan trycka på: egna symboler, linjer och ytor och Vidas objekt (Kraftledning, hänsynsytor, avlägg …). Samma
// uppbyggnad överallt så att korten aldrig kan se olika ut:
//
//   [ikon]  Namn · Grupp        ✕  ← "Kraftledning · Fara"; ✕ stänger (44 px träffyta), som svepet nedåt
//           Larmar alltid          ← larmregeln i klartext (lib/larm/grupper: larmRegelText). Info larmar aldrig och har ingen rad.
//   Kommentarer                    ← bara när det finns några, DIREKT under huvudet (det unika om just den här punkten): var sin ljusare ruta, källan överst
//                                    (Vidas text först med blå "Vida · traktdirektiv", sedan egna med "Namn · tid"), en punkt per radbrytning (numrerade vid ≥ 2)
//           EN mening              ← samma text som teckenförklaringen (lib/symboler)
//   Så ska det se ut ›             ← EN rad: miniatyr av målbilden; trycket öppnar bladet (components/malbild/MalbildRad). Aldrig utfälld i kortet.
//   <delar>                        ← det som är särskilt för typen (vägens färg, Vidas text, traktanalys …)
//   Foto                           ← bara när det finns foton
//   [Kommentar] [Foto] [Röst]      ← EN rad, tre lika knappar (ikon + kort text, ≥ 44 px); en knapp som inte får användas finns inte
//   <nederst>                      ← ljud, flytta, radera …
//
// Tomma sektioner finns inte: en rubrik står bara när det finns något under den. Skriver man en kommentar ersätter skrivfältet åtgärdsraden på samma plats.
//
// Komponenten äger bara UTSEENDET och redigeringsläget. Var kommentaren och fotona sparas bestämmer anroparen: egna markeringar sparar i markeringen
// (planering_markeringar, via markeringssynken), Vidas objekt hos OSS (objekt_yta_anteckning och objekt_yta_media, kopplade till objekt_id + Vida-objektets
// nyckel, lib/vidaNycklar) — Vidas egen data ändras aldrig.

import React, { useEffect, useRef, useState } from 'react';
import { GRUPPER, type FargGrupp } from '@/lib/larm/grupper';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, TRAFFYTA, TYP, VIKT, designCss } from '@/lib/design/tokens';
import { kommentarPunkter } from '@/lib/kommentarPunkter';
import { KommentarPunkter, KommentarRuta, KommentarVisning } from './KommentarRuta';

/** Svepet nedåt (px) som stänger kortet. */
const SVEP_STANG_PX = 100;

export interface KartKortFoto {
  id: string;
  /** Själva bilden (så att egna markeringar kan använda sin fotokomponent och Vidas objekt en vanlig bild). */
  node: React.ReactNode;
  text?: string | null;
  /** Vem som tog fotot och när: "Martin · i går 16:20". Null = okänt (äldre foto). */
  av?: string | null;
  /** Bildtexten går att ändra (sparas när fältet lämnas). */
  onSparaText?: (text: string) => void;
  /** Bara när fotot går att ta bort. */
  onTaBort?: () => void;
}

/** Raden på kortet (lib/kartkommentar `kortKommentarer`): författare och tid är färdig text, behörigheten är räknad. */
export type KartKortKommentar = import('@/lib/kartkommentar').KortKommentar;

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
  /** Vidas egen text för just det här objektet (ATGARD på en hänsynsyta/ett avlägg ur traktdirektivet). Står FÖRST bland kommentarerna, märkt "Vida · traktdirektiv". Ändras aldrig hos oss. */
  vidaKommentar?: string | null;
  /** Kommentarerna, äldst först: EN RAD PER KOMMENTAR med författare och tid (lib/kartkommentar). `null` = objektet kan inte ha kommentarer (ingen stabil nyckel). */
  kommentarer: KartKortKommentar[] | null;
  /** Får lägga till en kommentar (inloggad medarbetare). Ändra/ta bort styrs per rad. */
  kanKommentera: boolean;
  onLaggKommentar?: (text: string) => void;
  onAndraKommentar?: (id: string, text: string) => void;
  onRaderaKommentar?: (id: string) => void;
  foton: KartKortFoto[];
  /** Får lägga till/byta foto (knappen visas bara då). */
  onLaggTillFoto?: () => void;
  /** Texten på fotoknappen i åtgärdsraden ("Byt foto" när kortet bara har plats för ett). Default "Foto". */
  fotoKnapp?: string;
  fotoSparar?: boolean;
  fotoFel?: string | null;
  /** Röstanteckningen: knappen i åtgärdsraden startar/stoppar inspelningen (anroparen äger inspelningen och uppspelningen). Utan den finns ingen Röst-knapp. */
  rost?: KartKortRost;
  onStang: () => void;
  /** Raden "Så ska det se ut ›" (components/malbild/MalbildRad): under kommentaren, före typens delar. Null för sorter utan målbild (Fara, Info …) — då finns ingen rad. */
  malbild?: React.ReactNode;
  /** Det som är särskilt för typen (vägens färg, Vidas text, traktanalys …) — efter kommentaren och målbildsraden. Det som ska stå NEDERST (åtgärder, ljud, vägkontroll …),
   *  under fotona, läggs i <KartKortNederst>. */
  children?: React.ReactNode;
  testid?: string;
}

export interface KartKortRost {
  onToggle: () => void;
  /** Spelar in just nu — knappen visar stopp och sekunderna. */
  spelar: boolean;
  sekunder: number;
  /** T.ex. medan ett ljud sparas. */
  disabled?: boolean;
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
  const [skriverNy, setSkriverNy] = useState(false);
  const [nyText, setNyText] = useState('');
  const kanKommentera = !!(p.kommentarer && p.kanKommentera && p.onLaggKommentar);
  const harKommentarer = !!p.kommentarer && p.kommentarer.length > 0;
  const harVida = kommentarPunkter(p.vidaKommentar).length > 0;
  const harFoton = p.foton.length > 0;
  const harAtgarder = kanKommentera || !!p.onLaggTillFoto || !!p.rost;
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
          {/* Huvud: ikon, "Namn · Grupp", larmregel (inte för Info — det larmar aldrig), ✕ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l }}>
            <span data-testid="kartkort-ikon" style={{ flexShrink: 0, display: 'flex' }}>{p.ikon}</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <div data-testid="kartkort-namn" style={{ ...TYP.rubrik, color: FARG.text }}>
                {p.namn} <span style={{ color: p.grupp === 'info' ? FARG.text2 : g.farg }}>· {g.namn}</span>
              </div>
              {p.grupp !== 'info' && <div data-testid="kartkort-larmregel" style={{ ...TYP.meta, color: FARG.text2 }}>{p.larmRegel}</div>}
            </div>
            <button type="button" aria-label="Stäng" onClick={p.onStang} data-testid="kartkort-stang" className="press-dim"
              style={{ flexShrink: 0, alignSelf: 'flex-start', width: TRAFFYTA.min, height: TRAFFYTA.min, margin: `-${AVSTAND.xs}px -${AVSTAND.s}px 0 0`, padding: 0, border: 'none', background: 'transparent', color: FARG.text2, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad }}>close</span>
            </button>
          </div>
          {/* Det unika om just den här punkten först: kommentarerna direkt under huvudet, var sin ruta — bara när det finns några. Målbilden är EN rad under dem (aldrig utfälld). */}
          {(harVida || (p.kommentarer && harKommentarer)) && (
            <KartKortKommentarer vida={p.vidaKommentar} rader={p.kommentarer ?? []} onAndra={p.onAndraKommentar} onRadera={p.onRaderaKommentar} />
          )}
          {p.mening && <div data-testid="kartkort-mening" style={{ ...TYP.text, color: FARG.text2 }}>{p.mening}</div>}
          {p.kalla && <div data-testid="kartkort-kalla" style={{ ...TYP.micro, color: FARG.text3 }}>{p.kalla}</div>}

          {p.malbild}

          {delar}

          {harFoton && <KartKortFoton foton={p.foton} />}

          {/* Åtgärder: EN rad, tre lika knappar. Skriver man en kommentar ersätter skrivfältet raden på samma plats. */}
          {skriverNy && kanKommentera ? (
            <NyKommentar text={nyText} setText={setNyText}
              onSpara={() => { p.onLaggKommentar?.(nyText.trim()); setNyText(''); setSkriverNy(false); }}
              onAvbryt={() => { setNyText(''); setSkriverNy(false); }} />
          ) : harAtgarder ? (
            <div data-testid="kartkort-atgarder" style={{ display: 'flex', gap: AVSTAND.s }}>
              {kanKommentera && <AtgardKnapp testid="kartkort-kommentar-ny" ikon="add_comment" text="Kommentar" onClick={() => setSkriverNy(true)} />}
              {p.onLaggTillFoto && <AtgardKnapp testid="kartkort-foto-lagg-till" ikon="photo_camera" text={p.fotoKnapp ?? 'Foto'} onClick={p.onLaggTillFoto} disabled={p.fotoSparar} />}
              {p.rost && (
                <AtgardKnapp testid="kartkort-rost" ikon={p.rost.spelar ? 'stop' : 'mic'} text={p.rost.spelar ? `${p.rost.sekunder} s` : 'Röst'} onClick={p.rost.onToggle}
                  disabled={p.rost.disabled} farg={p.rost.spelar ? FARG.rod : undefined} puls={p.rost.spelar} />
              )}
            </div>
          ) : null}
          {p.fotoSparar && <div style={{ ...TYP.meta, color: FARG.text2 }}>Laddar upp…</div>}
          {p.fotoFel && <div data-testid="kartkort-foto-fel" style={{ ...TYP.meta, color: FARG.rod }}>{p.fotoFel}</div>}

          {nederst}
        </div>
      </div>
    </div>
  );
}

const rubrik: React.CSSProperties = { ...TYP.micro, color: FARG.text3, marginBottom: AVSTAND.s };
const knappLiten: React.CSSProperties = { ...KNAPP.sekundar, width: 'auto', minHeight: TRAFFYTA.min };

/** Knapparna längst ner på kortet (Förläng, Beräkna volym, Numrera om, Ta bort …): ORD, inte ikoner, samma stil överallt på kortet, minst 44 px. `destruktiv` = röd text (radera). */
export function KortKnapp({ text, onClick, testid, destruktiv, disabled }: { text: string; onClick: () => void; testid?: string; destruktiv?: boolean; disabled?: boolean }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} disabled={disabled} className="press-dim"
      style={{ ...KNAPP.sekundar, width: 'auto', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, color: destruktiv ? FARG.rod : FARG.text, opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}>
      {text}
    </button>
  );
}

/** Raden med kortets åtgärder (flera KortKnapp): bryter rad när de inte ryms. */
export function KortAtgarder({ children }: { children?: React.ReactNode }) {
  const barn = React.Children.toArray(children).filter(Boolean);
  if (!barn.length) return null;
  return <div data-testid="kartkort-kortatgarder" style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>{barn}</div>;
}

/** Åtgärdsraden: tre lika knappar (ikon + kort text, 44 px). */
function AtgardKnapp({ testid, ikon, text, onClick, disabled, farg, puls }: {
  testid: string; ikon: string; text: string; onClick: () => void; disabled?: boolean; farg?: string; puls?: boolean;
}) {
  return (
    <button type="button" data-testid={testid} disabled={disabled} onClick={onClick} className={puls ? 'press-dim puls' : 'press-dim'}
      style={{
        ...KNAPP.sekundar, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, width: 'auto', height: TRAFFYTA.min, padding: `0 ${AVSTAND.s}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: AVSTAND.xs, color: farg ?? FARG.text, opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>{ikon}</span>
      <span>{text}</span>
    </button>
  );
}

/** Skrivfältet för en ny kommentar (ersätter åtgärdsraden medan man skriver). */
function NyKommentar({ text, setText, onSpara, onAvbryt }: { text: string; setText: (t: string) => void; onSpara: () => void; onAvbryt: () => void }) {
  return (
    <div data-testid="kartkort-kommentar-ny-form">
      <textarea
        data-testid="kartkort-kommentar-falt" value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="En instruktion per rad" rows={3}
        style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.m, borderRadius: RADIE.kort, background: FARG.fyllning, border: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.text, fontFamily: 'inherit', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: AVSTAND.m, marginTop: AVSTAND.m }}>
        <button type="button" data-testid="kartkort-kommentar-spara" disabled={!text.trim()} onClick={onSpara} className="press-dim"
          style={{ ...KNAPP.primar, flex: 1, opacity: text.trim() ? 1 : 0.4 }}>Spara</button>
        <button type="button" data-testid="kartkort-kommentar-avbryt" onClick={onAvbryt} className="press-dim" style={knappLiten}>Avbryt</button>
      </div>
    </div>
  );
}

/** Kommentarerna: var sin ruta, källan överst. Vidas text först (blå "Vida · traktdirektiv", går inte att ändra), sedan egna ("Namn · tid"). Man ändrar och tar bort bara sina egna
 *  (admin får ta bort andras) — via "···" i rutan. Visas bara när det finns några. */
export function KartKortKommentarer({ vida, rader, onAndra, onRadera }: { vida?: string | null; rader: KartKortKommentar[]; onAndra?: (id: string, t: string) => void; onRadera?: (id: string) => void }) {
  return (
    <div data-testid="kartkort-kommentar" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      {kommentarPunkter(vida).length > 0 && <KommentarVisning vida text={vida ?? ''} />}
      {rader.map((r) => <KommentarRadVy key={r.id} r={r} onAndra={onAndra} onRadera={onRadera} />)}
    </div>
  );
}

function KommentarRadVy({ r, onAndra, onRadera }: { r: KartKortKommentar; onAndra?: (id: string, t: string) => void; onRadera?: (id: string) => void }) {
  const [skriver, setSkriver] = useState(false);
  const [utkast, setUtkast] = useState(r.text);
  const [fraga, setFraga] = useState(false);
  const [meny, setMeny] = useState(false);
  useEffect(() => { if (!skriver) setUtkast(r.text); }, [r.text, skriver]);
  const kanAndra = !!(r.kanAndra && onAndra);
  const kanRadera = !!(r.kanRadera && onRadera);
  const tre = (kanAndra || kanRadera) && !skriver && !fraga ? (
    <button type="button" aria-label="Fler val för kommentaren" aria-expanded={meny} data-testid="kartkort-kommentar-mer" onClick={() => setMeny((v) => !v)} className="press-dim"
      style={{ flexShrink: 0, width: TRAFFYTA.min, height: TRAFFYTA.min, margin: `-${AVSTAND.s}px -${AVSTAND.m}px -${AVSTAND.s}px 0`, padding: 0, border: 'none', background: 'transparent', color: FARG.text2, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad }}>more_horiz</span>
    </button>
  ) : null;
  return (
    <KommentarRuta testid="kartkort-kommentar-rad" kalla={<><span data-testid="kartkort-kommentar-forfattare">{r.forfattare ?? 'Äldre kommentar'}</span>{r.vantar ? <span data-testid="kartkort-kommentar-vantar"> · väntar</span> : null}</>} kallaFarg={FARG.text2} atgard={tre}>
      <div data-kommentar-id={r.id}>
        {skriver ? (
          <>
            <textarea
              data-testid="kartkort-kommentar-andra-falt" value={utkast} onChange={(e) => setUtkast(e.target.value)} autoFocus rows={3} placeholder="En instruktion per rad"
              style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.m, borderRadius: RADIE.kort, background: FARG.fyllning, border: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.kommentar, fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: AVSTAND.m, marginTop: AVSTAND.s }}>
              <button type="button" data-testid="kartkort-kommentar-andra-spara" disabled={!utkast.trim()} onClick={() => { onAndra?.(r.id, utkast.trim()); setSkriver(false); setMeny(false); }} className="press-dim"
                style={{ ...KNAPP.primar, flex: 1, opacity: utkast.trim() ? 1 : 0.4 }}>Spara</button>
              <button type="button" onClick={() => { setSkriver(false); setUtkast(r.text); }} className="press-dim" style={knappLiten}>Avbryt</button>
            </div>
          </>
        ) : (
          <>
            <KommentarPunkter text={r.text} />
            {fraga ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginTop: AVSTAND.m }}>
                <span style={{ ...TYP.meta, color: FARG.text2 }}>Ta bort kommentaren?</span>
                <button type="button" data-testid="kartkort-kommentar-ta-bort-ja" onClick={() => { onRadera?.(r.id); setFraga(false); setMeny(false); }} className="press-dim" style={{ ...knappLiten, color: FARG.rod }}>Ta bort</button>
                <button type="button" onClick={() => { setFraga(false); setMeny(false); }} className="press-dim" style={knappLiten}>Behåll</button>
              </div>
            ) : meny ? (
              <div data-testid="kartkort-kommentar-meny" style={{ display: 'flex', gap: AVSTAND.m, marginTop: AVSTAND.m }}>
                {kanAndra && <button type="button" data-testid="kartkort-kommentar-andra" onClick={() => { setUtkast(r.text); setSkriver(true); setMeny(false); }} className="press-dim" style={knappLiten}>Ändra</button>}
                {kanRadera && <button type="button" data-testid="kartkort-kommentar-ta-bort" onClick={() => setFraga(true)} className="press-dim" style={{ ...knappLiten, color: FARG.rod }}>Ta bort</button>}
              </div>
            ) : null}
          </>
        )}
      </div>
    </KommentarRuta>
  );
}

/** Fotona: bilderna med bildtext, författare och tid. Visas bara när det finns foton; "Foto" i åtgärdsraden lägger till. */
export function KartKortFoton({ foton }: { foton: KartKortFoto[] }) {
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
            {f.av ? <div data-testid="kartkort-foto-av" style={{ ...TYP.meta, color: FARG.text3 }}>{f.av}</div> : null}
            {f.onSparaText ? (
              <input type="text" defaultValue={f.text ?? ''} placeholder="Bildtext…" key={`${f.id}-${f.text ?? ''}`} data-testid="kartkort-foto-text"
                onBlur={(e) => { if ((f.text ?? '') !== e.target.value.trim()) f.onSparaText?.(e.target.value); }}
                style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.s, borderRadius: RADIE.kort, background: FARG.fyllning, border: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.meta, fontFamily: 'inherit' }} />
            ) : f.text ? <div style={{ ...TYP.meta, color: FARG.text2 }}>{f.text}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default KartKort;
