'use client';

// FOTOYTAN (PR 9b): ett foto i helskärm med ORD på bilden — punkter, linjer och pilar med en etikett, som på kartan (9a) men på fotot.
//
// SAMMA VERKTYG som på kartan: Punkt · Linje · Pil (RitaRad) och samma textark (NoteringSheet, "Så här blev det" / "Så här skulle det gjorts").
// Etiketten är FÖRIFYLLD med punktens namn ("Kulturlämning") och går att ändra; flera noteringar per bild; etiketten dras på plats.
//
// KOORDINATER: [u, v] 0..1 i den LAGRADE bildens egna koordinater (bilden är redan komprimerad och EXIF-vriden, så u,v bär samma mening i appen,
// på servern och i PDF:en). Etikettens förskjutning är i bildbredder och klämms (klamEtikett) vid sparningen mot SKÄRMENS ruta — det sparade
// är det som visas. Etikettens textstorlek är max(13 px, 3,2 % av visad bredd); PDF:en ritar 3,2 % av sin bredd och är aldrig större
// (lib/egenkontrollFotoEtikett.ts, provat över alla bredder).
//
// RITA, MÄTA, PLACERA: ETT TRYCK = EXAKT EN PUNKT (lib/ritaPunkter.ts, `arDubbeltryck`) — ingen utjämning, ingen mellanpunkt.
// EN AVSLUTAD RUNDA ÄR LÅST: bilden och noteringarna går att titta på, men ingen Rita-knapp, inget tryck på en etikett och inget drag. Databasen
// låser också (egenkontroll_notering_last); ytan visar det bara inte som något man kan göra.
//
// Ingen auto-placering sparas förrän noteringen skapas: en ny etikett föreslås en plats (planeraFotoEtiketter: aldrig ovanpå ett ankare, en linje
// eller en annan etikett) och SPARAS med den, så det man ser vid skapandet är det som ligger i databasen och i PDF:en.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, KNAPP, LAYOUT, RADIE, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { andraNotering } from '@/lib/egenkontroll';
import { arDubbeltryck, type TryckPunkt } from '@/lib/ritaPunkter';
import { klamEtikett, type Notering, type NoteringVerktyg, verktygTillForm } from '@/lib/egenkontrollNotering';
import {
  FOTO_ETIKETT_PAD_EM, FOTO_ETIKETT_RADHOJD_EM, FOTO_FORM, fotoKoordinaterGiltiga, fotoRitningTillKoordinater, ledarlinje, pilspets,
  planeraFotoEtiketter, skarmEtikettAndel, skarmEtikettPx, tryckTillUV, type FotoNoteringForm, type PlaceradFotoEtikett,
} from '@/lib/egenkontrollFotoEtikett';
import NoteringSheet, { type FotoPlats } from './NoteringSheet';
import RitaRad from './RitaRad';

export type FotoNoteringYtaProps = {
  egenkontrollId: string;
  /** Punktens foton, i den ordning de visas. */
  foton: { id: string; url: string }[];
  /** Vilket foto som öppnas först. */
  start: number;
  /** Punktens namn: titel och förifylld text på en ny notering. */
  rubrik: string;
  /** ALLA rundans noteringar; ytan väljer själv det som hör till fotot. */
  noteringar: Notering[];
  /** Noteringarna gick inte att läsa: ytan säger det i stället för att visa en bild som ser ut att sakna dem, och man kan inte skriva på den. */
  noteringarFel?: boolean;
  /** Avslutad runda: bara titta. */
  last: boolean;
  onStang: () => void;
  /** Läs om rundans noteringar efter en ändring. Ytan väntar in den innan den släpper sin egen bild av läget. */
  onAndrad: () => Promise<void> | void;
};

/** Ett drag längre än så här (px) är ett drag; kortare är ett tryck på etiketten. */
const DRAG_PX = 6;
const BLEV_STRECK = [6, 4] as const;
const ETIKETT_FONT = 'Helvetica, Arial, sans-serif';

type Mal = { w: number; h: number };
type Sheet = { lage: 'ny'; verktyg: NoteringVerktyg; koordinater: [number, number][] } | { lage: 'andra'; notering: Notering } | null;

/** Bildens uppritade ruta (px) inuti ytan: contain, centrerad. */
function passa(box: Mal, nat: Mal): { x: number; y: number; b: number; h: number } {
  const skala = Math.min(box.w / nat.w, box.h / nat.h);
  const b = nat.w * skala, h = nat.h * skala;
  return { x: (box.w - b) / 2, y: (box.h - h) / 2, b, h };
}

export default function FotoNoteringYta({ egenkontrollId, foton, start, rubrik, noteringar, noteringarFel = false, last, onStang, onAndrad }: FotoNoteringYtaProps) {
  const [index, setIndex] = useState(Math.max(0, Math.min(start, foton.length - 1)));
  const [box, setBox] = useState<Mal | null>(null);
  const [nat, setNat] = useState<Record<string, Mal>>({});
  const [ritaLage, setRitaLage] = useState(false);
  const [verktyg, setVerktyg] = useState<NoteringVerktyg | null>(null);
  const [tryck, setTryck] = useState<[number, number][]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [live, setLive] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const kroppRef = useRef<HTMLDivElement | null>(null);
  const senasteTryck = useRef<TryckPunkt | null>(null);
  const dragRef = useRef<{ id: string; x: number; y: number; dx0: number; dy0: number; flyttad: boolean } | null>(null);
  /** Ett drag följs ofta av en `click` på samma etikett: den får inte öppna noteringen. */
  const efterDrag = useRef(false);

  // Ritar man just nu (ett verktyg är valt) tar bilden emot tryck; då går etiketterna inte att trycka på eller dra. Medan man bara VÄLJER verktyg går de det.
  const ritarNu = ritaLage && verktyg !== null;
  const foto = foton[index] ?? null;
  const natMal = foto ? nat[foto.id] ?? null : null;
  const rekt = box && natMal ? passa(box, natMal) : null;
  const bildHojd = natMal ? natMal.h / natMal.w : null;
  const textAndel = rekt ? skarmEtikettAndel(rekt.b) : null;

  // Ytans storlek: mäts vid montering, vid fönsterändring och när ResizeObserver finns.
  const mat = useCallback(() => {
    const el = kroppRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox((f) => (f && Math.abs(f.w - r.width) < 0.5 && Math.abs(f.h - r.height) < 0.5 ? f : { w: r.width, h: r.height }));
  }, []);
  useEffect(() => {
    mat();
    window.addEventListener('resize', mat);
    const ro = typeof ResizeObserver !== 'undefined' && kroppRef.current ? new ResizeObserver(mat) : null;
    if (ro && kroppRef.current) ro.observe(kroppRef.current);
    return () => { window.removeEventListener('resize', mat); ro?.disconnect(); };
  }, [mat]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sheet) onStang(); };
    document.addEventListener('keydown', t);
    return () => document.removeEventListener('keydown', t);
  }, [onStang, sheet]);

  // Noteringarna på det här fotot, i skapad ordning (äldst först — samma ordning som i bilagan).
  const paFoto = useMemo(
    () => noteringar.filter((n) => n.underlag === 'foto' && n.foto_id === foto?.id && fotoKoordinaterGiltiga(n.typ, n.koordinater)),
    [noteringar, foto?.id],
  );
  const former: FotoNoteringForm[] = useMemo(
    () => paFoto.map((n) => ({
      id: n.id, typ: n.typ, pil: n.pil, etikett: n.etikett, punkter: n.koordinater,
      dx: live?.id === n.id ? live.dx : n.etikett_dx, dy: live?.id === n.id ? live.dy : n.etikett_dy,
    })),
    [paFoto, live],
  );
  const plan = useMemo(
    () => (bildHojd && textAndel ? planeraFotoEtiketter(former, bildHojd, textAndel) : new Map<string, PlaceradFotoEtikett>()),
    [former, bildHojd, textAndel],
  );

  // Det som räknats ur läget slås ut när de riktiga noteringarna har lästs om.
  useEffect(() => { setLive(null); }, [noteringar]);

  /** Etikettens plats för en text: andra noteringar där de ligger, den här (ny eller ändrad) placerad bland dem — det sparas. */
  const platsFor = useCallback((text: string, ny: { typ: 'punkt' | 'linje'; pil: boolean; punkter: [number, number][] } | null, andra: Notering | null): FotoPlats => {
    if (!bildHojd || !textAndel) throw new Error('Bilden är inte läst än — vänta tills den visas.');
    const id = andra ? andra.id : '__ny';
    const ovriga = former.filter((f) => f.id !== id);
    const sjalv: FotoNoteringForm = andra
      ? { id, typ: andra.typ, pil: andra.pil, etikett: text, punkter: andra.koordinater, dx: andra.etikett_dx, dy: andra.etikett_dy }
      : { id, typ: ny!.typ, pil: ny!.pil, etikett: text, punkter: ny!.punkter, dx: null, dy: null };
    const p = planeraFotoEtiketter([...ovriga, sjalv], bildHojd, textAndel).get(id);
    if (!p) throw new Error('Etiketten fick ingen plats på bilden.');
    return { u: p.ankare.x, v: p.ankare.y / bildHojd, bildHojd, dx: p.dx, dy: p.dy, ruta: p.ruta };
  }, [bildHojd, textAndel, former]);

  const avbrytRitning = () => { setVerktyg(null); setTryck([]); senasteTryck.current = null; setRitaLage(false); };
  const bytFoto = (d: number) => {
    setIndex((i) => Math.max(0, Math.min(foton.length - 1, i + d)));
    setTryck([]); setVerktyg(null); setLive(null); setFel(null); dragRef.current = null;
  };

  // TRYCKET TAS PÅ `click`, INTE PÅ `pointerdown`: ett ark som öppnas av pointerdown får sin egen avslutande `click` på bakgrunden (Ark stänger på ett
  // tryck utanför) — på en pekskärm stängdes formuläret alltså i samma ögonblick som det öppnades. Provat i riktig Chromium med touch.
  const ritaTryck = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ritaLage || verktyg === null || sheet) return;
    const r = e.currentTarget.getBoundingClientRect();
    const uv = tryckTillUV(e.clientX, e.clientY, { x: r.left, y: r.top, b: r.width, h: r.height });
    if (!uv) return;
    const nytt: TryckPunkt = { x: e.clientX, y: e.clientY, tid: Date.now() };
    if (arDubbeltryck(senasteTryck.current, nytt)) return;   // samma tryck igen (dubbelhändelse), aldrig två hörn
    senasteTryck.current = nytt;
    if (verktyg === 'punkt') {
      const k = fotoRitningTillKoordinater('punkt', [uv]);
      if (k) setSheet({ lage: 'ny', verktyg: 'punkt', koordinater: k });
      return;
    }
    setTryck((t) => [...t, uv]);
  };
  const ritaKlar = () => {
    if (verktyg === null || verktyg === 'punkt') return;
    const k = fotoRitningTillKoordinater(verktyg, tryck);
    if (k) setSheet({ lage: 'ny', verktyg, koordinater: k });
  };

  // DRA EN ETIKETT. Ett tryck utan drag öppnar noteringen; ett drag flyttar etiketten (klämd mot bilden medan man drar) och sparar när fingret släpper.
  const dragStart = (e: React.PointerEvent<HTMLDivElement>, p: PlaceradFotoEtikett) => {
    if (last || ritarNu || sheet || sparar) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: p.id, x: e.clientX, y: e.clientY, dx0: p.dx, dy0: p.dy, flyttad: false };
    efterDrag.current = false;
  };
  const dragFlytt = (e: React.PointerEvent<HTMLDivElement>, p: PlaceradFotoEtikett) => {
    const d = dragRef.current;
    if (!d || d.id !== p.id || !rekt || !bildHojd) return;
    if (!d.flyttad && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return;
    d.flyttad = true;
    const k = klamEtikett({
      u: p.ankare.x, v: p.ankare.y / bildHojd, bildHojd,
      dx: d.dx0 + (e.clientX - d.x) / rekt.b, dy: d.dy0 + (e.clientY - d.y) / rekt.b, ruta: p.ruta,
    });
    setLive({ id: p.id, dx: k.dx, dy: k.dy });
  };
  const dragSlut = async (e: React.PointerEvent<HTMLDivElement>, n: Notering, p: PlaceradFotoEtikett) => {
    const d = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d || d.id !== p.id || !d.flyttad || !bildHojd) return;      // ett tryck utan drag öppnar noteringen på `click` (se etikettTryck)
    efterDrag.current = true;
    const k = klamEtikett({
      u: p.ankare.x, v: p.ankare.y / bildHojd, bildHojd,
      dx: d.dx0 + (e.clientX - d.x) / (rekt?.b ?? 1), dy: d.dy0 + (e.clientY - d.y) / (rekt?.b ?? 1), ruta: p.ruta,
    });
    setSparar(true);
    setFel(null);
    try {
      await andraNotering(n.id, { etikett: n.etikett, avsikt: n.avsikt, forskjutning: { u: p.ankare.x, v: p.ankare.y / bildHojd, bildHojd, dx: k.dx, dy: k.dy, ruta: p.ruta } });
      await onAndrad();
    } catch (err) {
      setFel(err instanceof Error ? err.message : 'Etiketten gick inte att flytta.');
    } finally {
      setLive(null);
      setSparar(false);
    }
  };
  /** Ett tryck (inte ett drag) på en etikett öppnar noteringen — på `click`, av samma skäl som ritandet (ghost click på arkets bakgrund). */
  const etikettTryck = (n: Notering) => {
    if (efterDrag.current) { efterDrag.current = false; return; }
    if (last || ritarNu || sheet || sparar) return;
    setSheet({ lage: 'andra', notering: n });
  };

  const sheetKlar = async () => {
    setSheet(null);
    setTryck([]);
    setVerktyg(null);
    senasteTryck.current = null;
    await onAndrad();
  };

  const b = rekt?.b ?? 1;
  const px = (n: number) => n / b;                          // skärmpixlar -> bildbredder (SVG:ns enhet)
  const linjePx = Math.max(2, FOTO_FORM.linjeBredd * b);
  const kantPx = Math.max(4.5, FOTO_FORM.linjeKant * b);
  const punktR = Math.max(5, FOTO_FORM.punktR * b);
  const fontPx = skarmEtikettPx(b);

  const former2 = former.filter((f) => plan.has(f.id));
  const rubrikRad = foton.length > 1 ? `${rubrik} · ${index + 1} av ${foton.length}` : rubrik;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto: ${rubrik}`}
      data-testid="foto-yta"
      style={{
        position: 'fixed', inset: 0, zIndex: 1500, background: FARG.bg, color: FARG.text, display: 'flex', flexDirection: 'column',
        paddingTop: LAYOUT.safeTopp, fontFamily: 'inherit',
      }}
    >
      {/* HUVUD: Stäng till vänster (blå = navigerar), namnet i mitten, bläddra om punkten har flera foton. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: `0 ${AVSTAND.l}px`, minHeight: TRAFFYTA.primar, flexShrink: 0 }}>
        <button type="button" onClick={onStang} style={{ ...KNAPP.lank, width: 'auto', flexShrink: 0 }}>Stäng</button>
        <span style={{ ...TYP.listtitel, flex: 1, minWidth: 0, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rubrikRad}</span>
        <span style={{ display: 'flex', flexShrink: 0, width: foton.length > 1 ? undefined : 'auto' }}>
          {foton.length > 1 ? (
            <>
              <button type="button" aria-label="Föregående foto" disabled={index === 0} onClick={() => bytFoto(-1)}
                style={{ ...rundKnapp, opacity: index === 0 ? 0.4 : 1 }}><Ikon namn="chevron_left" farg="inherit" /></button>
              <button type="button" aria-label="Nästa foto" disabled={index === foton.length - 1} onClick={() => bytFoto(1)}
                style={{ ...rundKnapp, opacity: index === foton.length - 1 ? 0.4 : 1 }}><Ikon namn="chevron_right" farg="inherit" /></button>
            </>
          ) : <span style={{ width: TRAFFYTA.min }} aria-hidden="true" />}
        </span>
      </div>

      {/* BILDEN: contain-fit i det som blir kvar. Allt på bilden ligger i ett lager som är exakt lika stort som den uppritade bilden. */}
      <div ref={kroppRef} data-testid="foto-kropp" style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={foto.id}
            src={foto.url}
            alt={`Foto: ${rubrik}`}
            onLoad={(e) => {
              const im = e.currentTarget;
              if (im.naturalWidth > 0 && im.naturalHeight > 0) setNat((n) => ({ ...n, [foto.id]: { w: im.naturalWidth, h: im.naturalHeight } }));
              mat();
            }}
            draggable={false}
            style={rekt
              ? { position: 'absolute', left: rekt.x, top: rekt.y, width: rekt.b, height: rekt.h, display: 'block', userSelect: 'none', WebkitUserSelect: 'none' }
              : { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0 }}
          />
        )}

        {rekt && bildHojd && (
          <div data-testid="foto-lager" style={{ position: 'absolute', left: rekt.x, top: rekt.y, width: rekt.b, height: rekt.h }}>
            <svg
              viewBox={`0 0 1 ${bildHojd}`}
              preserveAspectRatio="none"
              width={rekt.b}
              height={rekt.h}
              aria-hidden="true"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
            >
              {paFoto.map((n) => {
                const skulle = n.avsikt === 'skulle';
                const pts = n.koordinater.map(([u, v]) => ({ x: u, y: v * bildHojd }));
                const streck = skulle ? BLEV_STRECK.map(px).join(' ') : undefined;
                const p = plan.get(n.id);
                const led = p ? ledarlinje(p.rekt, p.ankare) : null;
                return (
                  <g key={n.id} data-notering={n.id} data-avsikt={n.avsikt}>
                    {n.typ === 'punkt' || pts.length < 2 ? (
                      <>
                        <circle cx={pts[0].x} cy={pts[0].y} r={px(punktR + 1.5)} fill="none" stroke={FARG.text} strokeWidth={px(2)} />
                        <circle cx={pts[0].x} cy={pts[0].y} r={px(punktR)} fill={skulle ? 'none' : FARG.bg} stroke={FARG.bg} strokeWidth={px(skulle ? 2 : 0)} />
                      </>
                    ) : (
                      <>
                        <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={FARG.text} strokeWidth={px(kantPx)} strokeOpacity={0.9} strokeLinejoin="round" strokeLinecap="round" />
                        <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={FARG.bg} strokeWidth={px(linjePx)} strokeLinejoin="round" strokeDasharray={streck} />
                        {n.pil && (() => {
                          const sp = pilspets(pts, px(Math.max(11, FOTO_FORM.pilLang * b)), px(Math.max(5.5, FOTO_FORM.pilBred * b)), 0.001);
                          return sp ? <polygon points={sp.map((q) => `${q.x},${q.y}`).join(' ')} fill={FARG.bg} stroke={FARG.text} strokeWidth={px(1.5)} /> : null;
                        })()}
                      </>
                    )}
                    {led && <line x1={led[0].x} y1={led[0].y} x2={led[1].x} y2={led[1].y} stroke={FARG.text} strokeWidth={px(1.5)} />}
                  </g>
                );
              })}
              {/* Pågående ritning: tryckta punkter och linjen mellan dem. */}
              {ritaLage && tryck.length > 0 && (
                <g data-testid="foto-ritning">
                  {tryck.length > 1 && <polyline points={tryck.map(([u, v]) => `${u},${v * bildHojd}`).join(' ')} fill="none" stroke={FARG.text} strokeWidth={px(linjePx)} strokeLinejoin="round" />}
                  {tryck.map(([u, v], i) => <circle key={i} cx={u} cy={v * bildHojd} r={px(punktR)} fill={FARG.bg} stroke={FARG.text} strokeWidth={px(2)} />)}
                </g>
              )}
            </svg>

            {/* Etiketterna: HTML (skarp text), lika stora som modellens ruta. Träffytan är minst 44 px även när etiketten är mindre. */}
            {former2.map((f) => {
              const p = plan.get(f.id)!;
              const n = paFoto.find((q) => q.id === f.id)!;
              const skulle = n.avsikt === 'skulle';
              const w = p.ruta.bredd * b, h = p.ruta.hojd * b;
              const cx = (p.rekt.x0 + p.rekt.x1) / 2 * b, cy = (p.rekt.y0 + p.rekt.y1) / 2 * b;
              const traffW = Math.max(w, TRAFFYTA.min), traffH = Math.max(h, TRAFFYTA.min);
              const pad = FOTO_ETIKETT_PAD_EM * fontPx;
              return (
                <div
                  key={f.id}
                  data-testid="foto-etikett"
                  data-notering-id={f.id}
                  data-avsikt={n.avsikt}
                  role={last ? undefined : 'button'}
                  tabIndex={last ? undefined : 0}
                  aria-label={`Notering: ${n.etikett}`}
                  onPointerDown={last ? undefined : (e) => dragStart(e, p)}
                  onPointerMove={last ? undefined : (e) => dragFlytt(e, p)}
                  onPointerUp={last ? undefined : (e) => { void dragSlut(e, n, p); }}
                  onPointerCancel={last ? undefined : () => { dragRef.current = null; setLive(null); }}
                  onClick={last ? undefined : () => etikettTryck(n)}
                  onKeyDown={last ? undefined : (e) => { if (e.key === 'Enter' && !ritarNu && !sheet) setSheet({ lage: 'andra', notering: n }); }}
                  style={{
                    position: 'absolute', left: cx - traffW / 2, top: cy - traffH / 2, width: traffW, height: traffH, touchAction: 'none',
                    cursor: last || ritarNu ? 'default' : 'grab', pointerEvents: ritarNu ? 'none' : 'auto',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: w, height: h, boxSizing: 'border-box',
                      padding: pad, background: FARG.bg, color: FARG.text, border: `1px ${skulle ? 'dashed' : 'solid'} ${FARG.text}`, borderRadius: FOTO_FORM.etikettRundning * fontPx,
                      fontFamily: ETIKETT_FONT, fontSize: fontPx, lineHeight: FOTO_ETIKETT_RADHOJD_EM, whiteSpace: 'nowrap', overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none',
                    }}
                  >
                    {p.rader.map((rad, i) => <div key={i}>{rad}</div>)}
                  </div>
                </div>
              );
            })}

            {/* Ritlager: ett tryck på bilden = EXAKT en punkt. */}
            {ritaLage && verktyg !== null && (
              <div
                data-testid="foto-rita-yta"
                onClick={ritaTryck}
                style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'crosshair' }}
              />
            )}
          </div>
        )}
      </div>

      {/* FOT: Skriv på bilden (EN primär) → Punkt · Linje · Pil · ×. Avslutad runda: bara en rad om det. */}
      <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {/* Raden och knappen är lika höga (RitaRad: 48 + 2 × 8): bilden flyttar sig aldrig när man byter mellan dem. */}
        {(fel || noteringarFel) && (
          <div role="alert" style={{ background: FARG.upphojt, border: `1px solid ${FARG.rod}`, borderRadius: RADIE.rad, padding: AVSTAND.m, ...TYP.meta, color: FARG.text }}>
            {fel ?? 'Noteringarna kunde inte läsas — de syns inte på bilden just nu. Stäng bilden och ladda om sidan.'}
          </div>
        )}
        {last ? (
          <div role="note" style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>Rundan är avslutad — bilden och noteringarna går inte att ändra.</div>
        ) : ritaLage ? (
          <RitaRad
            verktyg={verktyg}
            antalTryck={tryck.length}
            onVal={(v) => { setVerktyg(v); setTryck([]); senasteTryck.current = null; }}
            onAngra={() => setTryck((t) => t.slice(0, -1))}
            onKlar={ritaKlar}
            onAvbryt={avbrytRitning}
          />
        ) : (
          <button
            type="button"
            disabled={!rekt || sparar || noteringarFel}
            onClick={() => { setFel(null); senasteTryck.current = null; setRitaLage(true); }}
            style={{ ...KNAPP.primar, minHeight: TRAFFYTA.primar + 2 * AVSTAND.s, ...((!rekt || sparar || noteringarFel) ? { opacity: 0.4 } : null) }}
          >
            Skriv på bilden
          </button>
        )}
      </div>

      {sheet && foto && (
        sheet.lage === 'ny' ? (
          <NoteringSheet
            key="ny"
            lage="ny"
            egenkontrollId={egenkontrollId}
            verktyg={sheet.verktyg}
            koordinater={sheet.koordinater}
            startText={rubrik}
            foto={{
              fotoId: foto.id,
              plats: (text) => platsFor(text, { ...verktygTillForm(sheet.verktyg), punkter: sheet.koordinater }, null),
            }}
            onStang={() => setSheet(null)}
            onSparad={() => { void sheetKlar(); }}
          />
        ) : (
          <NoteringSheet
            key={sheet.notering.id}
            lage="andra"
            notering={sheet.notering}
            plats={(text) => platsFor(text, null, sheet.notering)}
            onStang={() => setSheet(null)}
            onSparad={() => { setSheet(null); void onAndrad(); }}
          />
        )
      )}
    </div>
  );
}

/** Rund 44 px-knapp i huvudet (bläddra). */
const rundKnapp = {
  minHeight: TRAFFYTA.min, minWidth: TRAFFYTA.min, borderRadius: TRAFFYTA.min / 2, border: 'none', background: FARG.fyllning, color: FARG.text,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0, marginLeft: AVSTAND.xs,
} as const;
