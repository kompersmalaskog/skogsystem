// Körvyns och skotarlägets larm: matar lib/larm med sidans markeringar och Vidas geometri, spelar ljudet, håller förarens kvitteringar.
// Allt som avgör VAD som larmar ligger i lib/larm (rena funktioner med tester); den här hooken är bara kopplingen till sidan.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { avstandTillLinjeM } from '../larm/geo';
import { hamtaKvittens, medKvittens, sparaKvittens } from '../larm/kvittens';

import { markeraSett, stegaLarm, TOMT_LARM, type KvittensKarta, type LarmKort, type LarmNasta, type LarmObjekt, type LarmRing, type LarmState } from '../larm/larm';
import { ljudBeslut, spelaLarmLjud, type SenastLjud } from '../larm/ljud';
import { pulsGeometri } from '../larm/puls';
import { linjeObjekt, symbolObjekt, vidaObjekt, ytaObjekt } from '../larm/objekt';

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
  objektId: string | null;
  /** Den RIKTIGA inloggade föraren (kvitteringen skrivs under hens id; en simulerad förare kan inte spara). */
  forare: { id: string; namn: string | null } | null;
  db: { from: (tabell: string) => any };
  ljudCtx: () => AudioContext | null;
  /** Testläget (/maskin?som=): kvitteringen gäller bara i minnet, ingenting skrivs i databasen. */
  torr?: boolean;
}

/** Det stora larmets objekt på kartan: pulserar. Linjer är redan klippta till sträckan närmast maskinen. */
export interface LarmPuls { id: string; farg: string; geometri: Geometri }

export interface KorvyLarmUt {
  kort: LarmKort | null;
  /** Raden under kortet: nästa larm, eller "+N till". */
  nasta: LarmNasta | null;
  puls: LarmPuls | null;
  settRad: { id: string; namn: string } | null;
  ringar: RingMedGeometri[];
  kvittera: () => void;
}

const punkt = (ll: LL): [number, number] => [ll.lon, ll.lat];

export function useKorvyLarm(inp: KorvyLarmIn): KorvyLarmUt {
  const [ut, setUt] = useState<{ kort: LarmKort | null; nasta: LarmNasta | null; puls: LarmPuls | null; settRad: KorvyLarmUt['settRad']; ringar: RingMedGeometri[] }>({ kort: null, nasta: null, puls: null, settRad: null, ringar: [] });
  const ljudRef = useRef<SenastLjud | null>(null);
  const stateRef = useRef<LarmState>(TOMT_LARM);
  const kvittRef = useRef<KvittensKarta>(new Map());
  const risaInneRef = useRef<Set<string>>(new Set());
  const senastRef = useRef<{ objekt: Map<string, LarmObjekt> }>({ objekt: new Map() });
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
      setUt((u) => (u.kort || u.settRad || u.ringar.length ? { kort: null, nasta: null, puls: null, settRad: null, ringar: [] } : u));
      return;
    }
    const pos = inp.pos;
    const objekt: LarmObjekt[] = [];
    const geom = new Map<string, Geometri>();
    const risaNu = new Set<string>();

    for (const m of inp.markers) {
      if (m.isMarker && typeof m.x === 'number' && typeof m.y === 'number') {
        const ll = inp.svgToLatLon(m.x, m.y);
        const o = symbolObjekt({ id: m.id, type: m.type, comment: m.comment, lat: ll.lat, lon: ll.lon }, inp.typNamn(m.type), pos, inp.egna.has(String(m.id)));
        objekt.push(o);
        geom.set(o.id, { type: 'Point', coordinates: punkt(ll) });
      } else if (m.isLine && m.path?.length > 1) {
        const ring = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
        const o = linjeObjekt({ id: m.id, lineType: m.lineType, comment: m.comment, koordinater: ring }, pos);
        if (o) { objekt.push(o); geom.set(o.id, { type: 'LineString', coordinates: ring.map(punkt) }); }
        if (m.lineType === 'mainRoad' && m.risaPath?.length > 1) {
          const rp: LL[] = m.risaPath.map((p: any) => inp.svgToLatLon(p.x, p.y));
          const id = 'risa-' + m.id;
          const d = avstandTillLinjeM(pos, rp);
          const inne = d <= (risaInneRef.current.has(id) ? RISA_UT_M : RISA_IN_M);
          if (inne) risaNu.add(id);
          const y = ytaObjekt({ id, zoneType: 'wet', comment: '', ring: [] }, pos, inne);
          if (y) { objekt.push({ ...y, namn: 'Risa' }); geom.set(id, { type: 'LineString', coordinates: rp.map(punkt) }); }
        }
      } else if (m.isZone && m.path?.length > 2) {
        const ring: LL[] = m.path.map((p: any) => inp.svgToLatLon(p.x, p.y));
        const o = ytaObjekt({ id: m.id, zoneType: m.zoneType, comment: m.comment, ring }, pos);
        if (o) { objekt.push(o); geom.set(o.id, { type: 'Polygon', coordinates: [[...ring.map(punkt), punkt(ring[0])]] }); }
      }
    }
    risaInneRef.current = risaNu;

    const vidaFeatures = inp.vida?.features ?? [];
    for (const o of vidaObjekt(inp.vida, pos)) {
      objekt.push(o);
      const i = Number(o.id.split(':').pop());
      const g = vidaFeatures[i]?.geometry;
      if (g) geom.set(o.id, g);
    }

    senastRef.current = { objekt: new Map(objekt.map((o) => [o.id, o])) };
    const r = stegaLarm({ objekt, kvitt: kvittRef.current, forareId: inp.forare?.id ?? null, state: stateRef.current });
    stateRef.current = r.state;
    if (r.ljud) {
      // Flera nya larm inom ~2 s ger bara ett ljud (ljudBeslut); faran (mycket nära) tystas aldrig av ett ljud som kom just före.
      const b = ljudBeslut(ljudRef.current, Date.now(), r.ljud);
      ljudRef.current = b.senast;
      if (b.spela) spelaLarmLjud(inp.ljudCtx(), r.ljud);
    }
    if (r.vibration && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(r.vibration);
    const stor = r.ringar.find((x) => x.roll === 'stor');
    const storGeom = stor ? (pulsGeometri(geom.get(stor.id), pos) as Geometri | null) : null;
    setUt({
      kort: r.kort, nasta: r.nasta, settRad: r.settRad,
      puls: stor && storGeom ? { id: stor.id, farg: stor.farg, geometri: storGeom } : null,
      ringar: r.ringar.map((x) => ({ ...x, geometri: geom.get(x.id) ?? null })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inp.aktiv, inp.pos?.lat, inp.pos?.lon, inp.markers, inp.vida, inp.forare?.id, kvittVersion]);

  const kvittera = useCallback(() => {
    const i = inpRef.current;
    const rad = ut.settRad;
    if (!rad) return;
    const o = senastRef.current.objekt.get(rad.id);
    if (!o) return;
    const tid = new Date().toISOString();
    stateRef.current = markeraSett(stateRef.current, rad.id);
    setKvittVersion((v) => v + 1);   // räkna om direkt: nästa okvitterade larm flyttar upp utan att vänta på nästa GPS-fix
    if (!i.forare || !i.objektId) return;
    kvittRef.current = medKvittens(kvittRef.current, rad.id, { hash: o.hash, forareId: i.forare.id, tid });
    if (i.torr) return;   // testläget skriver inget i databasen
    void sparaKvittens(i.db, {
      objektId: i.objektId, markerId: rad.id, forareId: i.forare.id, forareNamn: i.forare.namn,
      typ: o.typ ?? null, namn: o.namn, grupp: o.grupp, hash: o.hash,
    }).then((fel) => { if (fel) console.error('[Körvy larm] kvittens, sparning:', fel); });
  }, [ut.settRad]);

  return { kort: ut.kort, nasta: ut.nasta, puls: ut.puls, settRad: ut.settRad, ringar: ut.ringar, kvittera };
}

