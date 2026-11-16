// Körvyns och skotarlägets larm: matar lib/larm med sidans markeringar och Vidas geometri, spelar ljudet, håller förarens kvitteringar.
// Allt som avgör VAD som larmar ligger i lib/larm (rena funktioner med tester); den här hooken är bara kopplingen till sidan.
'use client';

import { markerNyckel } from '../kartkommentar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { avstandTillLinjeM } from '../larm/geo';
import { hamtaKvittens, medKvittens, sparaKvittens } from '../larm/kvittens';

import { markeraSett, stegaLarm, TOMT_LARM, type KvittensKarta, type LarmKort, type LarmNasta, type LarmObjekt, type LarmPassage, type LarmRing, type LarmState } from '../larm/larm';
import { arPlaneradVag, avstandTillPlaneradVagM, stegaPaVag } from '../larm/passage';
import { skaSpelaLjud, spelaLarmLjud, type SenastLjud } from '../larm/ljud';
import type { Puls } from '../larm/pulsKarta';
import { linjeObjekt, symbolObjekt, vidaObjekt, ytaObjekt } from '../larm/objekt';
import { larmarInte } from '../egenYtaLarm';
import { sammaMur, SAMMA_MUR_TYPER, type MurBit } from '../larm/sammaMur';
import { laggTill, vyNamn } from '../fart/fartLogg';
import { lasVisat, sparaVisat, visadeNu, VISAT_EFTER_MS, type VisatKarta } from '../larm/visat';
import { arFara } from '../larm/larm';

type LL = { lat: number; lon: number };
type Geometri = { type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon' | 'MultiLineString' | 'MultiPoint'; coordinates: any };

/** Risa-delsträckan på en basväg räknas som Blött: in vid 12 m, ut först vid 16 m (hysteres, som förut). */
export const RISA_IN_M = 12;
export const RISA_UT_M = 16;

export interface RingMedGeometri extends LarmRing { geometri: Geometri | null }

export interface KorvyLarmIn {
  aktiv: boolean;
  pos: LL | null;
  markers: readonly any[];
  svgToLatLon: (x: number, y: number) => LL;
  /** Visningsnamn för en symboltyp ("Högstubbe"). */
  typNamn: (typ?: string) => string;
  /** Symboler föraren själv just satt i den här sessionen. */
  egna: ReadonlySet<string>;
  /** Vidas geometri (FeatureCollection) för objektet. */
  vida: { features?: any[] } | null;
  /** Senaste kommentaren med namn per objekt ("Daniel: Stolpe lutar"): nyckel ur lib/vidaNycklar för Vidas objekt, `marker:<id>` för egna markeringar. Visas i larmkortet och ingår i kvittensens hash. */
  kommentarer?: Readonly<Record<string, string>>;
  objektId: string | null;
  /** Den RIKTIGA inloggade föraren (kvitteringen skrivs under hens id; en simulerad förare kan inte spara). */
  forare: { id: string; namn: string | null } | null;
  db: { from: (tabell: string) => any };
  ljudCtx: () => AudioContext | null;
  /** Testläget (/maskin?som=): kvitteringen gäller bara i minnet, ingenting skrivs i databasen. */
  torr?: boolean;
}

export interface KorvyLarmUt {
  kort: LarmKort | null;
  /** Resten av larmen (det första flyttar upp när det stora är passerat): "+ Namn …" eller "+N till". */
  fler: LarmNasta[];
  /** Det stora larmets objekt — pulserar på kartan. Linjer: hela linjen (sidan klipper sträckan närmast maskinen, lib/larm/pulsKarta). */
  puls: Puls | null;
  settRad: { id: string; namn: string; farg: string } | null;
  ringar: RingMedGeometri[];
  /** Maskinen står på en planerad väg inne i en förbjuden yta: den lilla raden "Passage genom Hänsyn 6" (inget kort, inget ljud). Se lib/larm/passage. */
  passage: LarmPassage | null;
  kvittera: () => void;
}

const punkt = (ll: LL): [number, number] => [ll.lon, ll.lat];

/**
 * Larm till den tysta loggen (fart_logg, som GPS-händelserna): 'larm:visat' när ett kort kommer upp och 'larm:sett' när föraren trycker Sett.
 * Så går det att se i efterhand om ett kvitterat larm kom tillbaka (Stefan 2026-11-16: "jag har sett men det kom ändå"). Ett fel här får aldrig röra larmet.
 */
function loggaLarm(handelse: 'visat' | 'sett', detalj: Record<string, string | number | null>): void {
  try { laggTill({ slag: 'anrop', namn: `larm:${handelse}`, ms: 0, vy: typeof window !== 'undefined' ? vyNamn(window.location?.pathname ?? '/') : '/', detalj }); } catch { /* */ }
}

export function useKorvyLarm(inp: KorvyLarmIn): KorvyLarmUt {
  const [ut, setUt] = useState<{ kort: LarmKort | null; fler: LarmNasta[]; puls: Puls | null; settRad: KorvyLarmUt['settRad']; ringar: RingMedGeometri[]; passage: LarmPassage | null }>({ kort: null, fler: [], puls: null, settRad: null, ringar: [], passage: null });
  const senastLjudRef = useRef<SenastLjud | null>(null);
  // "Sett" ska ge nästa larm direkt, inte först vid nästa GPS-punkt.
  const [settVersion, setSettVersion] = useState(0);
  const stateRef = useRef<LarmState>(TOMT_LARM);
  const kvittRef = useRef<KvittensKarta>(new Map());
  const risaInneRef = useRef<Set<string>>(new Set());
  // På planerad väg (basväg/stickväg), med hysteres: på vid 7 m, av vid 11 m (lib/larm/passage).
  const paVagRef = useRef(false);
  const senastRef = useRef<{ objekt: Map<string, LarmObjekt> }>({ objekt: new Map() });
  // Stenmursbitar som hänger ihop är EN mur (lib/larm/sammaMur): ett Sett gäller hela kedjan.
  const kedjorRef = useRef<Map<string, string[]>>(new Map());
  const visatKortRef = useRef<string | null>(null);
  // EN VARNING PER HINDER (lib/larm/visat): hinder föraren redan varnats för, och korten som visas just nu (id → när de kom upp).
  const visatRef = useRef<VisatKarta>({});
  const uppeRef = useRef<Map<string, { hash: string; sedan: number; forbjuden: boolean }>>(new Map());
  const visatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    uppeRef.current = new Map();
    visatRef.current = inp.objektId && inp.forare?.id && !inp.torr ? lasVisat(inp.objektId, inp.forare.id) : {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.objektId, inp.forare?.id]);
  useEffect(() => () => { if (visatTimerRef.current) clearTimeout(visatTimerRef.current); }, []);
  /** Hindret (och resten av samma mur) räknas som varnat. Testläget minns bara i minnet. */
  const markeraVisat = useCallback((id: string) => {
    const i = inpRef.current;
    const ny = { ...visatRef.current };
    for (const x of kedjorRef.current.get(id) ?? [id]) { const o = senastRef.current.objekt.get(x); if (o && !arFara(o)) ny[x] = o.hash; }
    visatRef.current = ny;
    if (i.objektId && i.forare?.id && !i.torr) sparaVisat(i.objektId, i.forare.id, ny);
  }, []);
  const inpRef = useRef(inp);
  inpRef.current = inp;

  // Förarens kvitteringar på objektet. Ett läsfel ger fullt larm (hellre för mycket än för lite).
  const [kvittVersion, setKvittVersion] = useState(0);
  useEffect(() => {
    kvittRef.current = new Map();
    if (!inp.objektId || !inp.forare?.id) { setKvittVersion((v) => v + 1); return; }
    let avbruten = false;
    hamtaKvittens(inp.db, inp.objektId, inp.forare.id).then(({ karta, fel }) => {
      if (avbruten) return;
      if (fel) console.error('[Körvy larm] kvittens, läsning:', fel);
      kvittRef.current = karta;
      setKvittVersion((v) => v + 1);
    });
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.objektId, inp.forare?.id]);

  useEffect(() => {
    if (!inp.aktiv || !inp.pos) {
      stateRef.current = TOMT_LARM;
      risaInneRef.current = new Set();
      paVagRef.current = false;
      setUt((u) => (u.kort || u.settRad || u.ringar.length || u.puls || u.passage ? { kort: null, fler: [], puls: null, settRad: null, ringar: [], passage: null } : u));
      return;
    }
    const pos = inp.pos;
    const objekt: LarmObjekt[] = [];
    const geom = new Map<string, Geometri>();
    const risaNu = new Set<string>();
    const vagar: LL[][] = [];
    const murar: MurBit[] = [];

    for (const m of inp.markers) {
      // Larmkortets kommentar: den senaste med namn ("Daniel: Stolpe lutar"); finns ingen ny kommentar gäller markeringens äldre kommentarfält.
      const kommentar: string | undefined = inp.kommentarer?.[markerNyckel(m.id)] ?? m.comment;
      if (m.isMarker && typeof m.x === 'number' && typeof m.y === 'number') {
        const ll = inp.svgToLatLon(m.x, m.y);
        const o = symbolObjekt({ id: m.id, type: m.type, comment: kommentar, lat: ll.lat, lon: ll.lon }, inp.typNamn(m.type), pos, inp.egna.has(String(m.id)));
        objekt.push(o);
        geom.set(o.id, { type: 'Point', coordinates: punkt(ll) });
      } else if (m.isLine && m.path?.length > 1) {
        const ring = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
        if (arPlaneradVag(m.lineType)) vagar.push(ring);
        const o = linjeObjekt({ id: m.id, lineType: m.lineType, comment: kommentar, koordinater: ring }, pos);
        if (o) { objekt.push(o); geom.set(o.id, { type: 'LineString', coordinates: ring.map(punkt) }); if (SAMMA_MUR_TYPER.has(m.lineType)) murar.push({ id: o.id, typ: m.lineType, hash: o.hash, koordinater: ring }); }
        if (m.lineType === 'mainRoad' && m.risaPath?.length > 1) {
          const rp: LL[] = m.risaPath.map((p: any) => inp.svgToLatLon(p.x, p.y));
          const id = 'risa-' + m.id;
          const d = avstandTillLinjeM(pos, rp);
          const inne = d <= (risaInneRef.current.has(id) ? RISA_UT_M : RISA_IN_M);
          if (inne) risaNu.add(id);
          const y = ytaObjekt({ id, zoneType: 'wet', comment: '', ring: [] }, pos, inne);
          if (y) { objekt.push({ ...y, namn: 'Risa' }); geom.set(id, { type: 'LineString', coordinates: rp.map(punkt) }); }
        }
      } else if (m.isZone && m.path?.length > 2 && !larmarInte(m)) {   // "Larma inte" (lib/egenYtaLarm): ytan larmar inte
        const ring: LL[] = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
        const o = ytaObjekt({ id: m.id, zoneType: m.zoneType, comment: kommentar, ring }, pos);
        if (o) { objekt.push(o); geom.set(o.id, { type: 'Polygon', coordinates: [[...ring.map(punkt), punkt(ring[0])]] }); }
      }
    }
    risaInneRef.current = risaNu;

    const vidaFeatures = inp.vida?.features ?? [];
    for (const o of vidaObjekt(inp.vida, pos, undefined, inp.kommentarer)) {
      objekt.push(o);
      const i = Number(o.id.split(':').pop());
      const g = vidaFeatures[i]?.geometry;
      if (g) geom.set(o.id, g);
    }

    senastRef.current = { objekt: new Map(objekt.map((o) => [o.id, o])) };
    kedjorRef.current = murar.length > 1 ? sammaMur(murar) : new Map();
    paVagRef.current = stegaPaVag(paVagRef.current, avstandTillPlaneradVagM(pos, vagar));
    // Kort som stått uppe i VISAT_EFTER_MS, eller som maskinen kört ifrån, är varnade — FÖRE stegningen, så att de inte larmar en gång till i samma steg.
    const nuMs = Date.now();
    for (const [id, u] of Array.from(uppeRef.current)) {
      const o = objekt.find((x) => x.id === id);
      const kvar = !!o && (o.kalla === 'yta' ? !!o.inne : (o.avstandM ?? Infinity) <= 50);
      // En förbjuden yta står kvar som kort så länge maskinen är inne första gången; övriga hinder släpper efter en halv minut.
      if (!kvar || (!u.forbjuden && nuMs - u.sedan >= VISAT_EFTER_MS)) { markeraVisat(id); uppeRef.current.delete(id); }
    }
    const r = stegaLarm({ objekt, kvitt: kvittRef.current, forareId: inp.forare?.id ?? null, state: stateRef.current, paVag: paVagRef.current, visade: visadeNu(visatRef.current, objekt) });
    stateRef.current = r.state;
    // Det stora kortet har nu visats: börja räkna. (Fara räknas aldrig — den larmar alltid.)
    if (r.kort && r.kort.okvitterad && r.kort.grupp !== 'fara' && !uppeRef.current.has(r.kort.id)) {
      const ko = objekt.find((x) => x.id === r.kort!.id);
      if (ko) uppeRef.current.set(ko.id, { hash: ko.hash, sedan: nuMs, forbjuden: !!ko.forbjuden });
      if (ko && !ko.forbjuden) {
        if (visatTimerRef.current) clearTimeout(visatTimerRef.current);
        visatTimerRef.current = setTimeout(() => setSettVersion((v) => v + 1), VISAT_EFTER_MS + 50);
      }
    }
    // Ett ljud per ny sak, men flera nya inom ~2 s ger bara ett (ett starkare får ersätta ett svagare).
    const nu = Date.now();
    if (r.ljud && skaSpelaLjud(r.ljud, nu, senastLjudRef.current)) {
      spelaLarmLjud(inp.ljudCtx(), r.ljud);
      senastLjudRef.current = { tid: nu, ljud: r.ljud };
      if (r.vibration && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(r.vibration);
    }
    if ((r.kort?.id ?? null) !== visatKortRef.current) {
      visatKortRef.current = r.kort?.id ?? null;
      if (r.kort) { const ko = senastRef.current.objekt.get(r.kort.id); loggaLarm('visat', { id: r.kort.id, typ: ko?.typ ?? null, grupp: ko?.grupp ?? null, okvitterad: r.kort.okvitterad ? 1 : 0, avstand: ko?.avstandM != null ? Math.round(ko.avstandM) : null }); }
    }
    const stor = r.kort ? geom.get(r.kort.id) : null;
    setUt({
      kort: r.kort, fler: r.fler, settRad: r.settRad,
      puls: r.kort && stor ? { id: r.kort.id, farg: r.kort.farg, geometri: stor } : null,
      ringar: r.ringar.map((x) => ({ ...x, geometri: geom.get(x.id) ?? null })),
      passage: r.passage,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.aktiv, inp.pos?.lat, inp.pos?.lon, inp.markers, inp.vida, inp.kommentarer, inp.forare?.id, kvittVersion, settVersion]);

  const kvittera = useCallback(() => {
    const i = inpRef.current;
    const rad = ut.settRad;
    if (!rad) return;
    const o = senastRef.current.objekt.get(rad.id);
    if (!o) return;
    const tid = new Date().toISOString();
    // Hela muren: biten föraren står vid och de bitar som hänger ihop med den (lib/larm/sammaMur). Annars bara det ena objektet.
    const kedja = (kedjorRef.current.get(rad.id) ?? [rad.id]).map((id) => senastRef.current.objekt.get(id)).filter((x): x is LarmObjekt => !!x);
    for (const x of kedja) stateRef.current = markeraSett(stateRef.current, x.id);
    markeraVisat(rad.id); uppeRef.current.delete(rad.id);
    setUt((u) => (u.settRad?.id === rad.id ? { ...u, settRad: null } : u));
    setSettVersion((v) => v + 1);
    loggaLarm('sett', { id: rad.id, typ: o.typ ?? null, grupp: o.grupp, bitar: kedja.length });
    if (!i.forare || !i.objektId) return;
    for (const x of kedja) kvittRef.current = medKvittens(kvittRef.current, x.id, { hash: x.hash, forareId: i.forare.id, tid });
    if (i.torr) return;   // testläget skriver inget i databasen
    for (const x of kedja) {
      void sparaKvittens(i.db, {
        objektId: i.objektId, markerId: x.id, forareId: i.forare.id, forareNamn: i.forare.namn,
        typ: x.typ ?? null, namn: x.namn, grupp: x.grupp, hash: x.hash,
      }).then((fel) => { if (fel) console.error('[Körvy larm] kvittens, sparning:', fel); });
    }
  }, [ut.settRad, markeraVisat]);

  return { kort: ut.kort, fler: ut.fler, puls: ut.puls, settRad: ut.settRad, ringar: ut.ringar, passage: ut.passage, kvittera };
}

