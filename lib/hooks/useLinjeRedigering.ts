'use client';

// REDIGERA LINJER (Martin 2026-10-25, skiss 47–48): läget, ångra-historiken, Vidas dolda delar och kopplingen mellan pekaren (lib/linjeRedigeringKarta), den rena geometrin
// (lib/linjeRedigering) och markeringarna. Sidan äger markeringarna (`setMarkers` sparar det som ändrats; borttagna anropas `deleteMarker` för) — här sker bara redigeringen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  arRedigerbar, forlangMarkor, kopplaMarkor, suddaMarkor, type LinjeMarkor, type LngLat, type Omvandling, type Resultat,
} from '../linjeRedigering';
import {
  LINJERED_FORHAND_KALLA, LINJERED_KALLA, andeHandtag, kopplaLinjeRedigering, linjeRedigeringLager, type RedIn, type RedLage, type RedLinje,
} from '../linjeRedigeringKarta';
import {
  doljMer, doltSpoken, klippVidaGeometri, lasDolt, narmasteSpoke, skrivDolt, sparaLokaltDolt, synligaDelar, vidaLinjer, visaOriginal, visaStracka, type DoltPerLinje,
} from '../vidaDolt';

export const VIDA_ID = 'vida:';

interface Steg { markers: any[]; dolt: DoltPerLinje }

export interface LinjeRedIn {
  map: any | null;
  klar: boolean;
  /** Markeringarna (state) — för att hålla ändhandtagen i takt med kartan. */
  markers: any[];
  /** Alla markeringar just nu (senaste, utan att vänta på rendering). */
  markersRef: { current: any[] };
  setMarkers: (fn: (prev: any[]) => any[]) => void;
  deleteMarker: (id: string | number) => unknown;
  /** Sidans omvandling mellan markeringarnas x/y och [lng, lat] (byter funktion varje rendering — läses via ref). */
  svgToLatLon: (x: number, y: number) => { lat: number; lon: number };
  latLonToSvg: (lat: number, lon: number) => { x: number; y: number };
  visibleLines: Record<string, boolean>;
  /** Vidas geometri för objektet (ouppklippt — larmen läser den). */
  traktGeo: { features?: any[] } | null;
  objektId: string | null;
  /** Bara admin får dölja/ta tillbaka Vidas linjer (RLS på objekt_linje_dolt). */
  arAdmin: boolean;
  db: { from: (t: string) => any };
  /** Id:n som skapas här ska aldrig tas för "nyritad väg nära en annan" av basvägs-sammanslagningsfrågan. */
  mergeChecked: { current: Set<string> };
}

export const VIDA_BARA_PLANERARE = 'Bara planeraren kan ändra Vidas linjer';
export const DOLT_EJ_SPARAT = 'Kunde inte spara – försök igen';

export function useLinjeRedigering(inp: LinjeRedIn) {
  const [lage, setLage] = useState<RedLage | null>(null);
  const [meddelande, setMeddelande] = useState<string | null>(null);
  const meddelandeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visaMeddelande = useCallback((t: string) => {
    setMeddelande(t);
    if (meddelandeTimer.current) clearTimeout(meddelandeTimer.current);
    meddelandeTimer.current = setTimeout(() => setMeddelande(null), 4000);
  }, []);
  useEffect(() => () => { if (meddelandeTimer.current) clearTimeout(meddelandeTimer.current); }, []);
  const [dolt, setDolt] = useState<DoltPerLinje>({});
  const [historikN, setHistorikN] = useState(0);
  const historik = useRef<Steg[]>([]);
  const inpRef = useRef(inp);
  inpRef.current = inp;
  const doltRef = useRef(dolt);
  doltRef.current = dolt;
  const nastaId = useRef(Date.now());

  // Det dolda hör till objektet: läses när objektet byts (tabellen eller enhetens kopia).
  useEffect(() => {
    const oid = inp.objektId;
    historik.current = []; setHistorikN(0); setLage(null);
    if (!oid) { setDolt({}); return; }
    let avbruten = false;
    lasDolt(inp.db, oid).then((r) => { if (!avbruten) setDolt(r.dolt); });
    return () => { avbruten = true; };
  }, [inp.objektId]); // eslint-disable-line react-hooks/exhaustive-deps

  const omv = useCallback((): Omvandling => ({
    tillLngLat: (p) => { const l = inpRef.current.svgToLatLon(p.x, p.y); return [l.lon, l.lat]; },
    tillSvg: (c) => inpRef.current.latLonToSvg(c[1], c[0]),
    nyttId: () => { const upptagna = new Set(inpRef.current.markersRef.current.map((m) => String(m.id))); do { nastaId.current += 1; } while (upptagna.has(String(nastaId.current))); return nastaId.current; },
  }), []);

  const vida = useMemo(() => vidaLinjer(inp.traktGeo), [inp.traktGeo]);
  const vidaRef = useRef(vida);
  vidaRef.current = vida;

  /** Linjerna att peka på: egna redigerbara (inte de som lagervalet döljer) + Vidas (det som syns). */
  const linjer = useCallback((): RedLinje[] => {
    const o = omv();
    const ut: RedLinje[] = [];
    for (const m of inpRef.current.markersRef.current) {
      if (!arRedigerbar(m) || inpRef.current.visibleLines[m.lineType] === false) continue;
      const coords = (m.path as any[]).map((p) => o.tillLngLat(p));
      ut.push({ id: String(m.id), egen: true, coords, delar: [coords] });
    }
    for (const v of vidaRef.current) ut.push({ id: VIDA_ID + v.nyckel, egen: false, coords: v.coords, delar: synligaDelar(v, doltRef.current), skyddad: v.skyddad });
    return ut;
  }, [omv]);

  const skjutHistorik = () => {
    historik.current.push({ markers: inpRef.current.markersRef.current, dolt: doltRef.current });
    if (historik.current.length > 100) historik.current.shift();
    setHistorikN(historik.current.length);
  };

  const tillampa = (res: Resultat<LinjeMarkor>) => {
    if (res.sparas.length === 0 && res.tasBort.length === 0) return;
    skjutHistorik();
    for (const m of res.markers) inpRef.current.mergeChecked.current.add(String(m.id));
    const bort = new Set(res.tasBort.map(String));
    const nya = new Map(res.markers.map((m) => [String(m.id), m]));
    inpRef.current.setMarkers((prev) => {
      const kvar = prev.filter((m) => !bort.has(String(m.id))).map((m) => nya.get(String(m.id)) ?? m);
      const finns = new Set(kvar.map((m) => String(m.id)));
      return [...kvar, ...res.markers.filter((m) => !finns.has(String(m.id)))];
    });
    res.tasBort.forEach((id) => inpRef.current.deleteMarker(id));
  };

  /** Dölj/ta tillbaka på Vidas linjer. Icke-admin får inte (servern nekar): ingenting ändras och det sägs — aldrig ett tyst val som bara gäller på enheten. */
  const sattDolt = (efter: DoltPerLinje) => {
    const fore = doltRef.current;
    if (efter === fore) return;
    if (!inpRef.current.arAdmin) { visaMeddelande(VIDA_BARA_PLANERARE); return; }
    const oid = inpRef.current.objektId;
    if (!oid) return;
    skjutHistorik();
    setDolt(efter);
    doltRef.current = efter;
    skrivDolt(inpRef.current.db, oid, fore, efter).then((ok) => {
      if (ok) return;
      // Servern fick inte ändringen: tillbaka till det som gäller där, och säg det.
      if (doltRef.current === efter) { setDolt(fore); doltRef.current = fore; historik.current.pop(); setHistorikN(historik.current.length); }
      sparaLokaltDolt(oid, fore);
      visaMeddelande(DOLT_EJ_SPARAT);
    });
  };

  const onSudda = useCallback((id: string, iv: Array<[number, number]>) => {
    if (id.startsWith(VIDA_ID)) { sattDolt(doljMer(doltRef.current, vidaRef.current, id.slice(VIDA_ID.length), iv)); return; }
    tillampa(suddaMarkor(inpRef.current.markersRef.current as LinjeMarkor[], id, iv, omv()));
  }, [omv]); // eslint-disable-line react-hooks/exhaustive-deps

  const onForlang = useCallback((id: string, ande: 'start' | 'slut', till: LngLat) => {
    tillampa(forlangMarkor(inpRef.current.markersRef.current as LinjeMarkor[], id, ande, till, omv()));
  }, [omv]); // eslint-disable-line react-hooks/exhaustive-deps

  const onKoppla = useCallback((id: string, ande: 'start' | 'slut', faste: Parameters<RedIn['onKoppla']>[2]) => {
    const mal = faste.typ === 'ande' ? { typ: 'ande' as const, id: faste.id, ande: faste.ande, punkt: faste.punkt } : { typ: 'punkt' as const, punkt: faste.punkt };
    // Ett fäste på en Vida-linje är bara en punkt: ingen sammanslagning med Vidas data.
    tillampa(kopplaMarkor(inpRef.current.markersRef.current as LinjeMarkor[], id, ande, faste.typ === 'punkt' ? { typ: 'punkt', punkt: faste.punkt } : mal, omv()));
  }, [omv]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ett kort tryck på en dold sträcka (spöket) tar tillbaka den. */
  const onTryck = useCallback((p: LngLat, radieM: number) => {
    const t = narmasteSpoke(inpRef.current.traktGeo, doltRef.current, p, radieM);
    if (t) sattDolt(visaStracka(doltRef.current, t.nyckel, t.index));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** "Visa Vidas original" i linjens kort. */
  const visaVidaOriginal = useCallback((nyckel: string) => { sattDolt(visaOriginal(doltRef.current, nyckel)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const angra = useCallback(() => {
    const s = historik.current.pop();
    setHistorikN(historik.current.length);
    if (!s) return;
    const nu = inpRef.current.markersRef.current;
    const tillbaka = new Set(s.markers.map((m) => String(m.id)));
    for (const m of s.markers) inpRef.current.mergeChecked.current.add(String(m.id));
    inpRef.current.setMarkers(() => s.markers);
    for (const m of nu) if (!tillbaka.has(String(m.id))) inpRef.current.deleteMarker(m.id);
    if (s.dolt !== doltRef.current) {
      const fore = doltRef.current;
      const oid = inpRef.current.objektId;
      setDolt(s.dolt); doltRef.current = s.dolt;
      if (oid) skrivDolt(inpRef.current.db, oid, fore, s.dolt).then((ok) => {
        if (ok) return;
        if (doltRef.current === s.dolt) { setDolt(fore); doltRef.current = fore; }
        sparaLokaltDolt(oid, fore);
        visaMeddelande(DOLT_EJ_SPARAT);
      });
    }
  }, [visaMeddelande]);

  const oppna = useCallback((l: RedLage = 'sudda') => { historik.current = []; setHistorikN(0); setMeddelande(null); setLage(l); }, []);
  const stang = useCallback(() => { historik.current = []; setHistorikN(0); setLage(null); }, []);

  // Kartans version av Vidas geometri: de dolda delarna är borta (Vidas data rörs aldrig, larmen läser den ouppklippta).
  useEffect(() => {
    const map = inp.map;
    if (!map || !inp.klar || !inp.traktGeo) return;
    const src = map.getSource('trakt-geo-source') as any;
    if (!src) return;
    try { src.setData(klippVidaGeometri(inp.traktGeo, dolt)); } catch { /* källan inte klar */ }
  }, [inp.map, inp.klar, inp.traktGeo, dolt]);

  // Det som står stilla medan läget är på: ändhandtag och spöken.
  useEffect(() => {
    const map = inp.map;
    if (!map || !inp.klar) return;
    const kalla = map.getSource(LINJERED_KALLA) as any;
    if (!kalla) return;
    const tom = { type: 'FeatureCollection', features: [] as any[] };
    if (!lage) { try { kalla.setData(tom); (map.getSource(LINJERED_FORHAND_KALLA) as any)?.setData(tom); } catch { /* */ } return; }
    const handtag = andeHandtag(linjer(), lage).features;
    const spoken = doltSpoken(inp.traktGeo, dolt).features.map((f) => ({ ...f, properties: { ...f.properties, slag: 'spoke' } }));
    try { kalla.setData({ type: 'FeatureCollection', features: [...handtag, ...spoken] }); } catch { /* */ }
  }, [inp.map, inp.klar, lage, dolt, inp.traktGeo, inp.markers, inp.visibleLines]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pekaren.
  const redIn = useRef<RedIn>({ lage, linjer, onSudda, onForlang, onKoppla, onTryck });
  redIn.current = { lage, linjer, onSudda, onForlang, onKoppla, onTryck };
  useEffect(() => {
    if (!inp.map || !inp.klar || !lage) return;
    return kopplaLinjeRedigering(inp.map, () => redIn.current);
  }, [inp.map, inp.klar, !!lage]); // eslint-disable-line react-hooks/exhaustive-deps

  return { aktiv: lage !== null, lage, setLage, oppna, stang, angra, kanAngra: historikN > 0, dolt, visaVidaOriginal, meddelande };
}

/** Källor och lager läggs på kartan en gång (kallas där övriga lager skapas). */
export function laggLinjeRedigeringLager(map: any): void {
  for (const k of [LINJERED_KALLA, LINJERED_FORHAND_KALLA]) if (!map.getSource(k)) map.addSource(k, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const l of linjeRedigeringLager()) if (!map.getLayer(l.id)) map.addLayer(l);
}
