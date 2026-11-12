'use client';

// SKOTARLÄNKEN (/skotare/<token>) — för en EXTERN skotare som skotar efter vår skördare. Ingen inloggning: länken bär en lång slumpad token.
// Byggd för maskindatorn: Chrome på Windows, stor pekskärm, helskärm, installerbar som app.
//
// KARTAN SKA VARA REN (Martin 2026-11-06): bara kartan och EN knapp, + nere till höger (som i maskinerna). Inga volymer på kartan —
// de kommer när man vill: + › Kvar på trakten, Rita runt (tryck ut hörnen runt högarna → vad som ligger kvar där, bocka i det han tagit),
// eller ett tryck på en hög (volymen + Tagen). Håll fingret på kartan = Rita runt börjar där.
//
// ETT SÄTT ATT RAPPORTERA (Martin 2026-11-06: "måste veta hur mycket det ligger på varje avlägg", och inget som kan bli dubbelt):
// "Tagen" frågar vart det gick (bara när trakten har fler än ett avlägg) och servern skriver markeringen OCH volymen på avlägget i samma steg.
// Det finns inget lasskort. Markeringarna sparas i samma tabell som våra förares, så de syns i planeringen och i våra skotare.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import Ark from '@/components/design/Ark';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import VadBetyderKartan from '@/components/planering/VadBetyderKartan';
import { BASKARTOR } from '@/lib/mapLayers';
import { BACKVAG_STRECK_FARGER } from '@/lib/backvag';
import { backvagIkonNamn, PIL_STIL, ritaBackvagStreck, ritaPilIkon, ritaStolpeIkon } from '@/lib/kartstil';
import { canvasToMapLibreImage, loadMarkerImageForMaplibre, markerIconDefs } from '@/lib/marker-icons';
import { SNEDSTRECK_GRUPPER, snedstreckBild, snedstreckId } from '@/lib/ytaStil';
import { vidaSlagIFeatures } from '@/lib/teckenforklaring';
import { KALLA, LAGER, STANDARD_LAGER, finns as finnsLager, kallor, lagerIdn, lagerOrdning, markeringKort, vidaKort, type Data, type Lager, type LngLat, type TryckKort } from '@/lib/skotarlank/karta';
import type { HogSortiment, SkotarHog } from '@/lib/skotarlank/hogar';
import type { Avlagg } from '@/lib/skotarlank/avlagg';
import { ritaRuta, RUTA_BILD, RUTA_STRACK } from '@/lib/skotarLass/avlaggKarta';
import { laggTillTeckenBilder } from '@/lib/kommentarTecken';
import { hallSkarmenVakenIWebblasare } from '@/lib/skarmVaken';
import { useRitadSkotare } from '@/lib/skotarlank/useRitadSkotare';
import { telefonText, useSkotarPosition } from '@/lib/skotarlank/useSkotarPosition';
import { cirkelPolygon } from '@/lib/telefonGps';

type Vy = Omit<Data, 'avlagg'> & {
  ok: true;
  namn: string;
  mitt: { lat: number; lng: number } | null;
  hogar: { hogar: SkotarHog[]; kvar: HogSortiment[]; kvarM3: number; skordatM3: number } | null;
  avlagg: Avlagg[] | null;
  sortiment: { namn: string; visning: string }[];
  origoText: string | null;
  kommentarer: Record<string, string[]>;
  omTrakten: { direktiv: string | null; kommentarer: string[] };
  fel: string[];
  uppdaterad: string;
};
type Lage = { typ: 'laddar' } | { typ: 'fel'; status: number; text: string } | { typ: 'ok'; vy: Vy };

const OMLASNING_MS = 5 * 60_000;
const LAGRING_LAGER = 'skotarlank_lager_v2';
const LAGRING_BAS = 'skotarlank_bas_v1';
/** Knapparna på kartan: större än appens minsta, för en pekskärm i en skakande hytt. */
const KNAPP_PX = 60;
const KART_BAKGRUND = '#1b2a17';
/** Så nära (px) fingret måste vara en hög för att den ska räknas som tryckt. */
const HOG_TRAFF_PX = 16;
/** Rita runt: ett tryck så här nära första hörnet stänger ringen. */
const STANG_RING_PX = 28;
/** Håll fingret så här länge (ms) för att börja rita runt, utan att röra det mer än LANGTRYCK_PX. */
const LANGTRYCK_MS = 500;
const LANGTRYCK_PX = 10;
const ANGRA_MS = 5000;
const RING_KALLA = 'sk-ring';
const POS_KALLA = 'sk-position';

type Omrade = { hogar: number; kvar: number; skordat: number; grupper: { grupp: string; namn: string; m3: number }[] };
type Panel = null | 'meny' | 'kvar' | 'om' | 'lager' | 'forklaring';
/** Avlägget han senast körde till — står först när han väljer vart det gick. */
const LAGRING_SENASTE_AVLAGG = 'skotarlank_senaste_avlagg_v1';
/** Kvittot efter en sparning; `lass` = Ångra tar bort lasset (och markeringen det skapades av). */
type Kvitto = { text: string; lass?: string };
/** Det han markerat taget och ännu inte sagt vart det gick. */
type Taget = { plats: { punkt: LngLat } | { ring: LngLat[] }; grupper: (string | null)[]; text: string; klar?: () => void };
/** Sortimentgrupperna man kan bocka i "I området" (övrigt går bara med Allt är taget — tabellen har ingen grupp för det). */
const VALBARA_GRUPPER = ['timmer', 'kubb', 'massa', 'energi'];
const nyttId = () => (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));

const tal = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
const klocka = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });

function las<T>(nyckel: string, standard: T): T {
  try { const v = JSON.parse(localStorage.getItem(nyckel) || 'null'); return v == null ? standard : (typeof standard === 'object' ? { ...standard, ...v } : v); } catch { return standard; }
}
function spara(nyckel: string, v: unknown) { try { localStorage.setItem(nyckel, JSON.stringify(v)); } catch { /* bara bekvämlighet */ } }

/** Felet i ord: vad skotaren ska göra. */
function felText(status: number): string {
  if (status === 404) return 'Länken finns inte. Be den som skickade den om en ny.';
  if (status === 410) return 'Länken gäller inte längre — trakten är klar eller länken är avstängd. Ring den som skickade den.';
  return 'Kartan går inte att hämta just nu. Kontrollera täckningen — sidan försöker igen av sig själv.';
}

type BasId = 'foto' | 'karta' | 'ritad';
const BAS_NAMN: Record<BasId, string> = { foto: 'Flygfoto', karta: 'Karta', ritad: 'Ritad' };
const lasBas = (): BasId => { const b = las<BasId>(LAGRING_BAS, 'foto'); return b === 'karta' || b === 'ritad' ? b : 'foto'; };
function kartStil(token: string, bas: BasId): maplibregl.StyleSpecification {
  const foto = BASKARTOR.find((b) => b.id === 'satellite');
  const karta = BASKARTOR.find((b) => b.id === 'lantmateriet');
  const kalla = (lager: 'foto' | 'karta') => ({ type: 'raster' as const, tiles: [`${location.origin}/api/skotare/${token}/karta?lager=${lager}&z={z}&x={x}&y={y}`], tileSize: 256, maxzoom: 18, attribution: '© Lantmäteriet' });
  return {
    version: 8,
    sources: { foto: kalla('foto'), karta: kalla('karta') },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': KART_BAKGRUND } },
      { id: 'bas-foto', type: 'raster', source: 'foto', paint: (foto?.paint ?? {}) as never, layout: { visibility: bas === 'foto' ? 'visible' : 'none' } },
      { id: 'bas-karta', type: 'raster', source: 'karta', paint: (karta?.paint ?? {}) as never, layout: { visibility: bas === 'karta' ? 'visible' : 'none' } },
    ],
  };
}

async function laggTillBilder(map: maplibregl.Map): Promise<void> {
  const laddar: Promise<void>[] = [];
  const lagg = (namn: string, b: unknown) => { try { if (b && !map.hasImage(namn)) map.addImage(namn, b as never); } catch { /* en ikon som saknas fäller inte kartan */ } };
  for (const def of markerIconDefs) {
    const namn = `marker-${def.id}`;
    if (!map.hasImage(namn)) laddar.push(loadMarkerImageForMaplibre(def.id).then((b) => lagg(namn, b)).catch(() => undefined));
  }
  for (const pil of PIL_STIL) lagg(`arrow-${pil.id}`, canvasToMapLibreImage(ritaPilIkon(pil.color)));
  for (const f of BACKVAG_STRECK_FARGER) lagg(backvagIkonNamn(f), canvasToMapLibreImage(ritaBackvagStreck(f)));
  for (const g of SNEDSTRECK_GRUPPER) lagg(snedstreckId(g), snedstreckBild(g));
  lagg('kraftledning-stolpe', canvasToMapLibreImage(ritaStolpeIkon()));
  // Avläggens vita ruta (samma bild som skotarläget) och bubblan/kameran på markeringar med kommentar eller foto.
  try {
    const ruta = ritaRuta();
    if (ruta && !map.hasImage(RUTA_BILD)) map.addImage(RUTA_BILD, ruta, { pixelRatio: 2, stretchX: RUTA_STRACK.stretchX.map((r) => [...r]) as never, stretchY: RUTA_STRACK.stretchY.map((r) => [...r]) as never, content: [...RUTA_STRACK.content] as never });
  } catch { /* fäller inte kartan */ }
  laggTillTeckenBilder(map);
  await Promise.all(laddar);
}

export default function SkotarSida({ token }: { token: string }) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });
  const [lager, setLager] = useState<Record<Lager, boolean>>(STANDARD_LAGER);
  const [bas, setBas] = useState<BasId>('foto');
  const [panel, setPanel] = useState<Panel>(null);
  const [kort, setKort] = useState<TryckKort | null>(null);
  const [helskarm, setHelskarm] = useState(false);
  const [installera, setInstallera] = useState<{ prompt: () => Promise<void> } | null>(null);
  // Rita runt: hörnen, om ringen är stängd, och svaret från servern.
  const [ritar, setRitar] = useState(false);
  const [ring, setRing] = useState<LngLat[]>([]);
  const [ringKlar, setRingKlar] = useState(false);
  // Sortimenten han bockat i "I området" (tomt = allt).
  const [valdaGrupper, setValdaGrupper] = useState<string[]>([]);
  const [omrade, setOmrade] = useState<{ typ: 'laddar' } | { typ: 'fel' } | { typ: 'ok'; svar: Omrade } | null>(null);
  const [sparar, setSparar] = useState(false);
  const [kvitto, setKvitto] = useState<Kvitto | null>(null);
  const [sparFel, setSparFel] = useState<string | null>(null);
  // Avläggen: valt avlägg (kortet), lasskortet och läget "placera nytt avlägg".
  const [avlaggRef, setAvlaggRef] = useState<string | null>(null);
  const [vart, setVart] = useState<Taget | null>(null);
  const [placerar, setPlacerar] = useState(false);
  const placerarRef = useRef(false);
  placerarRef.current = placerar;

  const behallare = useRef<HTMLDivElement>(null);
  const kartaRef = useRef<maplibregl.Map | null>(null);
  const [kartaKlar, setKartaKlar] = useState(false);
  const kameraSatt = useRef(false);
  const vyRef = useRef<Vy | null>(null);
  vyRef.current = lage.typ === 'ok' ? lage.vy : vyRef.current;
  const ritarRef = useRef(false);
  ritarRef.current = ritar && !ringKlar;
  const svaljKlick = useRef(false);

  // Telefonen som GPS: telefonen skickar, datorn hämtar och ritar pricken (lib/skotarlank/useSkotarPosition).
  const gps = useSkotarPosition(token);

  // Valen minns per dator.
  useEffect(() => { setLager(las(LAGRING_LAGER, STANDARD_LAGER)); setBas(lasBas()); }, []);

  // --- Datan: nu, och var 5:e minut. Ett läsfel efter att kartan visats tar inte bort kartan.
  const hamta = useCallback(async (farsk = false) => {
    try {
      const r = await fetch(`/api/skotare/${token}${farsk ? '?farsk=1' : ''}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) { setLage({ typ: 'ok', vy: j as Vy }); return; }
      setLage((f) => (f.typ === 'ok' && r.status >= 500 ? f : { typ: 'fel', status: r.status, text: felText(r.status) }));
    } catch {
      setLage((f) => (f.typ === 'ok' ? f : { typ: 'fel', status: 0, text: felText(0) }));
    }
  }, [token]);
  useEffect(() => {
    void hamta();
    const t = setInterval(() => { void hamta(); }, OMLASNING_MS);
    const synlig = () => { if (document.visibilityState === 'visible') void hamta(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', synlig); };
  }, [hamta]);

  // Skärmen släcks inte medan kartan är framme (maskindatorn).
  useEffect(() => hallSkarmenVakenIWebblasare(), []);

  // Helskärm och installation.
  useEffect(() => {
    const kolla = () => setHelskarm(!!document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches);
    kolla();
    document.addEventListener('fullscreenchange', kolla);
    const fore = (e: Event) => { e.preventDefault(); const ev = e as Event & { prompt: () => Promise<void> }; setInstallera({ prompt: () => ev.prompt() }); };
    const installerad = () => setInstallera(null);
    window.addEventListener('beforeinstallprompt', fore);
    window.addEventListener('appinstalled', installerad);
    return () => { document.removeEventListener('fullscreenchange', kolla); window.removeEventListener('beforeinstallprompt', fore); window.removeEventListener('appinstalled', installerad); };
  }, []);
  const vaxlaHelskarm = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  // --- Rita runt.
  const borjaRita = useCallback((forsta?: LngLat) => {
    setKort(null); setPanel(null); setOmrade(null); setValdaGrupper([]); setRingKlar(false); setRing(forsta ? [forsta] : []); setRitar(true);
  }, []);
  const slutaRita = useCallback(() => { setRitar(false); setRing([]); setRingKlar(false); setOmrade(null); setValdaGrupper([]); }, []);
  const laggHorn = useCallback((p: LngLat, punkt: { x: number; y: number }) => {
    const map = kartaRef.current;
    setRing((r) => {
      if (r.length >= 3 && map) {
        const p0 = map.project(r[0]);
        if (Math.hypot(p0.x - punkt.x, p0.y - punkt.y) <= STANG_RING_PX) { setRingKlar(true); return r; }
      }
      return [...r, p];
    });
  }, []);

  // Ringen är stängd → fråga servern vad som ligger kvar där.
  useEffect(() => {
    if (!ringKlar || ring.length < 3) return;
    let aktuell = true;
    setOmrade({ typ: 'laddar' });
    void (async () => {
      try {
        const r = await fetch(`/api/skotare/${token}/omrade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ring }) });
        const j = await r.json().catch(() => null);
        if (aktuell) setOmrade(r.ok && j?.ok ? { typ: 'ok', svar: j as Omrade } : { typ: 'fel' });
      } catch { if (aktuell) setOmrade({ typ: 'fel' }); }
    })();
    return () => { aktuell = false; };
  }, [ringKlar, ring, token]);

  // --- Taget: det han tagit (en hög eller ringen, ett sortiment per markering — eller allt) + vart det gick. Servern räknar volymen ur högarna
  // och skriver markeringarna och lasset på avlägget i ett steg. Ångra i 5 s = lasset och markeringarna tas bort.
  const skickaTaget = useCallback(async (t: Taget, avlagg: Avlagg): Promise<void> => {
    setSparar(true); setSparFel(null);
    const lass = nyttId();
    const markeringar = t.grupper.map((grupp) => ({ id: nyttId(), ...t.plats, ...(grupp ? { grupp } : {}) }));
    try {
      const r = await fetch(`/api/skotare/${token}/taget`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lass, avlagg: avlagg.ref, markeringar }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setSparFel(j?.fel || 'Kunde inte spara — försök igen'); return; }
      spara(`${LAGRING_SENASTE_AVLAGG}:${token}`, avlagg.ref);
      setVart(null);
      setKvitto({ text: `${tal(Number(j.m3) || 0)} m³ till ${avlagg.nr ? `avlägg ${avlagg.nr}` : 'avlägget'}`, lass });
      t.klar?.();
      void hamta(true);
    } catch { setSparFel('Kunde inte spara — kontrollera täckningen och försök igen'); }
    finally { setSparar(false); }
  }, [token, hamta]);
  /** "Tagen": ett enda avlägg = dit direkt; fler = frågan vart det gick; inget = sätt ut ett först. */
  const taget = useCallback((t: Taget) => {
    const lista = vyRef.current?.avlagg;
    setSparFel(null);
    if (!lista) { setSparFel('Avläggen gick inte att läsa just nu — försök igen'); return; }
    if (lista.length === 0) { setSparFel('Sätt ut ett avlägg först: + › Nytt avlägg'); return; }
    if (lista.length === 1) { void skickaTaget(t, lista[0]); return; }
    setVart(t);
  }, [skickaTaget]);
  const taBortLass = useCallback(async (id: string, angrat = false) => {
    setKvitto(null);
    try {
      const r = await fetch(`/api/skotare/${token}/lass?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      setKvitto({ text: r.ok ? (angrat ? 'Ångrat' : 'Borttaget') : (j?.fel || 'Gick inte att ta bort') });
    } catch { setKvitto({ text: 'Gick inte att ta bort' }); }
    void hamta(true);
  }, [token, hamta]);
  useEffect(() => {
    if (!kvitto) return;
    const t = setTimeout(() => setKvitto(null), ANGRA_MS);
    return () => clearTimeout(t);
  }, [kvitto]);

  // --- Nytt avlägg: ett tryck på kartan i placeringsläget. Servern ger numret; sedan öppnas avläggskortet.
  const nyttAvlagg = useCallback(async (punkt: LngLat) => {
    setPlacerar(false); setSparFel(null);
    const id = nyttId();
    try {
      const r = await fetch(`/api/skotare/${token}/avlagg`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, punkt }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setKvitto({ text: j?.fel || 'Kunde inte spara avlägget' }); return; }
      await hamta(true);
      setAvlaggRef(String(j.ref));
    } catch { setKvitto({ text: 'Kunde inte spara avlägget — kontrollera täckningen' }); }
  }, [token, hamta]);
  const nyttAvlaggRef = useRef(nyttAvlagg);
  nyttAvlaggRef.current = nyttAvlagg;

  const taBortAvlagg = useCallback(async (ref: string) => {
    const id = ref.replace(/^egen:/, '');
    try {
      const r = await fetch(`/api/skotare/${token}/avlagg?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = await r.json().catch(() => null);
      setKvitto({ text: r.ok ? 'Avlägget borttaget' : (j?.fel || 'Gick inte att ta bort avlägget') });
      if (r.ok) setAvlaggRef(null);
    } catch { setKvitto({ text: 'Gick inte att ta bort avlägget' }); }
    void hamta(true);
  }, [token, hamta]);

  // --- Kartan skapas en gång (när datan finns första gången).
  const harData = lage.typ === 'ok';
  useEffect(() => {
    if (!harData || !behallare.current || kartaRef.current) return;
    const v = vyRef.current;
    const start = v?.mitt ?? { lat: 56.6, lng: 15.0 };
    const map = new maplibregl.Map({
      container: behallare.current, style: kartStil(token, lasBas()),
      center: [start.lng, start.lat], zoom: 14, maxPitch: 0, dragRotate: false, doubleClickZoom: false, attributionControl: { compact: true },
    });
    try { map.touchZoomRotate.disableRotation(); } catch { /* */ }
    kartaRef.current = map;
    // 'load' kan utebli tills kartan ritas om (sett i Chromium utan synlig ändring) — vi väcker den några gånger. Görs EN gång.
    let gjort = false;
    const klarGor = async () => { if (gjort) return; gjort = true; await laggTillBilder(map); setKartaKlar(true); };
    map.on('load', () => { void klarGor(); });
    let vack = 0;
    const vackare = setInterval(() => { if (gjort || ++vack > 25) { clearInterval(vackare); return; } if (map.loaded()) void klarGor(); else map.triggerRepaint(); }, 400);
    map.on('click', (e) => {
      if (svaljKlick.current) { svaljKlick.current = false; return; }
      // I ritläget gör ett tryck bara ett hörn — inget annat på kartan öppnas.
      if (ritarRef.current) { laggHorn([e.lngLat.lng, e.lngLat.lat], e.point); return; }
      if (placerarRef.current) { void nyttAvlaggRef.current([e.lngLat.lng, e.lngLat.lat]); return; }
      const vy = vyRef.current;
      if (!vy) return;
      // Det under fingret (26 px åt varje håll): symbol före hög före linje före yta.
      const r = 26;
      const traffar = map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]])
        .filter((f) => f.source === KALLA.mark || f.source === KALLA.vida || f.source === KALLA.hogar || f.source === KALLA.avlagg)
        // En hög träffas bara när fingret är PÅ den (högarna ligger tätt; annars går det aldrig att trycka på ytan under dem).
        .filter((f) => {
          if (f.source !== KALLA.hogar || f.geometry.type !== 'Point') return true;
          const q = map.project(f.geometry.coordinates as [number, number]);
          return Math.hypot(q.x - e.point.x, q.y - e.point.y) <= HOG_TRAFF_PX;
        });
      const rang = (f: maplibregl.MapGeoJSONFeature) => {
        const p = f.properties ?? {};
        if (f.source === KALLA.mark) return p.kind === 'symbol' || p.kind === 'pil' ? 0 : p.kind === 'linje' ? 2 : 3;
        if (f.source === KALLA.hogar) return 1;
        return f.geometry.type === 'Point' ? 0 : f.geometry.type.includes('Line') ? 2 : 3;
      };
      traffar.sort((a, b) => rang(a) - rang(b));
      const f = traffar[0];
      if (!f) return;
      const p = f.properties ?? {};
      setSparFel(null);
      // Ett avlägg (hans eget, planerarens eller Vidas) öppnar avläggskortet: det som lossats där och Lossa här.
      const ref = f.source === KALLA.avlagg ? String(p.ref ?? '')
        : f.source === KALLA.mark && typeof p.i === 'number' && vy.markeringar[p.i]?.type === 'landing' ? `plan:${String(vy.markeringar[p.i].id)}`
          : f.source === KALLA.vida && typeof p.vi === 'number' && vy.vida[p.vi]?.properties._typ === 'punkt' ? `vida:${String(vy.vida[p.vi].properties.EXTRA_LABE ?? vy.vida[p.vi].properties.LOPNR ?? '').trim()}` : '';
      if (ref && vy.avlagg?.some((a) => a.ref === ref)) { setKort(null); setAvlaggRef(ref); return; }
      if (f.source === KALLA.mark && typeof p.i === 'number' && vy.markeringar[p.i]) setKort(markeringKort(vy.markeringar[p.i], vy.kommentarer));
      else if (f.source === KALLA.hogar && typeof p.hi === 'number' && vy.hogar?.hogar[p.hi]) setKort({ typ: 'hog', hog: vy.hogar.hogar[p.hi] });
      else if (f.source === KALLA.vida && typeof p.vi === 'number' && vy.vida[p.vi]) setKort(vidaKort(vy.vida[p.vi].properties));
    });

    // Håll fingret stilla en halv sekund = Rita runt börjar där (som skotarläget). Rörelse, ett andra finger eller släpp avbryter.
    const el = behallare.current;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start0: { x: number; y: number } | null = null;
    let pekare = 0;
    const avbryt = () => { if (timer) clearTimeout(timer); timer = null; start0 = null; };
    const ned = (ev: PointerEvent) => {
      pekare++;
      if (pekare > 1 || ritarRef.current || ev.button > 0) { avbryt(); return; }
      const rekt = el.getBoundingClientRect();
      start0 = { x: ev.clientX - rekt.left, y: ev.clientY - rekt.top };
      timer = setTimeout(() => {
        timer = null;
        if (!start0) return;
        const ll = map.unproject([start0.x, start0.y]);
        svaljKlick.current = true;
        borjaRita([ll.lng, ll.lat]);
        start0 = null;
      }, LANGTRYCK_MS);
    };
    const flytt = (ev: PointerEvent) => {
      if (!start0) return;
      const rekt = el.getBoundingClientRect();
      if (Math.hypot(ev.clientX - rekt.left - start0.x, ev.clientY - rekt.top - start0.y) > LANGTRYCK_PX) avbryt();
    };
    const upp = () => { pekare = Math.max(0, pekare - 1); avbryt(); };
    el.addEventListener('pointerdown', ned);
    el.addEventListener('pointermove', flytt);
    el.addEventListener('pointerup', upp);
    el.addEventListener('pointercancel', upp);
    const kontext = (ev: Event) => ev.preventDefault();
    el.addEventListener('contextmenu', kontext);
    return () => {
      avbryt(); clearInterval(vackare);
      el.removeEventListener('pointerdown', ned); el.removeEventListener('pointermove', flytt); el.removeEventListener('pointerup', upp); el.removeEventListener('pointercancel', upp); el.removeEventListener('contextmenu', kontext);
      try { map.remove(); } catch { /* */ } kartaRef.current = null; setKartaKlar(false);
    };
  }, [harData, token, laggHorn, borjaRita]);

  // Bakgrunden: bara synligheten byts (inga lager behöver läggas om).
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar) return;
    map.setLayoutProperty('bas-foto', 'visibility', bas === 'foto' ? 'visible' : 'none');
    map.setLayoutProperty('bas-karta', 'visibility', bas === 'karta' ? 'visible' : 'none');
  }, [bas, kartaKlar]);
  // Ritad: skogen ur laserdatan, blött, brant, vägar och diken — samma ritning som appen (lib/skotarlank/useRitadSkotare).
  const ritad = useRitadSkotare({ map: kartaRef.current, klar: kartaKlar, vald: bas === 'ritad', token });

  // --- Källor och lager.
  const vy = lage.typ === 'ok' ? lage.vy : null;
  const k = useMemo(() => (vy ? kallor(vy) : null), [vy]);
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar || !k) return;
    for (const [id, data] of Object.entries(k)) {
      const s = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (s) s.setData(data as never); else map.addSource(id, { type: 'geojson', data: data as never });
    }
    for (const spec of lagerOrdning()) {
      if (map.getLayer(spec.id)) continue;
      try { map.addLayer(spec); } catch (e) { console.error('[skotarkarta] lagret kunde inte läggas till', spec.id, e); }
    }
  }, [k, kartaKlar]);

  // Ringen man ritar: blå som Mät, med mörk kant (högarna är ljusa prickar — en vit ring skulle försvinna bland dem).
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar) return;
    const fs: unknown[] = [];
    if (ritar) {
      if (ring.length >= 3) fs.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } });
      if (ring.length >= 2) fs.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ringKlar ? [...ring, ring[0]] : ring } });
      ring.forEach((p, i) => fs.push({ type: 'Feature', properties: { forsta: i === 0 }, geometry: { type: 'Point', coordinates: p } }));
    }
    const data = { type: 'FeatureCollection', features: fs };
    const s = map.getSource(RING_KALLA) as maplibregl.GeoJSONSource | undefined;
    if (s) { s.setData(data as never); return; }
    map.addSource(RING_KALLA, { type: 'geojson', data: data as never });
    map.addLayer({ id: 'sk-ring-fyll', type: 'fill', source: RING_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': FARG.bla, 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'sk-ring-kant', type: 'line', source: RING_KALLA, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': 'rgba(0,0,0,0.8)', 'line-width': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addLayer({ id: 'sk-ring-linje', type: 'line', source: RING_KALLA, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': FARG.bla, 'line-width': 3 }, layout: { 'line-join': 'round', 'line-cap': 'round' } });
    map.addLayer({ id: 'sk-ring-horn', type: 'circle', source: RING_KALLA, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': ['case', ['get', 'forsta'], 9, 6], 'circle-color': FARG.bla, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
  }, [ritar, ring, ringKlar, kartaKlar]);

  // Skotarens position: blå prick med vit kant och telefonens osäkerhet som en svag cirkel. Grå när den är gammal. Överst på kartan.
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar) return;
    const p = gps.position;
    const fs: unknown[] = [];
    if (p) {
      if (p.noggrannhet != null && p.noggrannhet > 3) fs.push({ type: 'Feature', properties: { farsk: gps.farsk }, geometry: cirkelPolygon(p.lat, p.lng, p.noggrannhet) });
      fs.push({ type: 'Feature', properties: { farsk: gps.farsk }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } });
    }
    const data = { type: 'FeatureCollection', features: fs };
    const s = map.getSource(POS_KALLA) as maplibregl.GeoJSONSource | undefined;
    if (s) {
      s.setData(data as never);
      // Ligger överst även när andra lager lagts till senare (rita runt, Ritad).
      for (const id of ['sk-pos-osakerhet', 'sk-pos-osakerhet-kant', 'sk-pos-prick']) if (map.getLayer(id)) map.moveLayer(id);
      return;
    }
    map.addSource(POS_KALLA, { type: 'geojson', data: data as never });
    const farg = ['case', ['get', 'farsk'], FARG.bla, FARG.text3];
    map.addLayer({ id: 'sk-pos-osakerhet', type: 'fill', source: POS_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': farg as never, 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'sk-pos-osakerhet-kant', type: 'line', source: POS_KALLA, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': farg as never, 'line-opacity': 0.5, 'line-width': 1 } });
    map.addLayer({ id: 'sk-pos-prick', type: 'circle', source: POS_KALLA, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 10, 'circle-color': farg as never, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  }, [gps.position, gps.farsk, kartaKlar]);
  const visaMig = useCallback(() => {
    const map = kartaRef.current;
    const p = gps.position;
    if (!map || !p) return;
    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16), duration: 500 });
  }, [gps.position]);

  // Synligheten följer valen.
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar || !k) return;
    for (const [val, idn] of Object.entries(lagerIdn()) as [Lager, string[]][]) {
      for (const id of idn) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', lager[val] ? 'visible' : 'none');
    }
  }, [lager, kartaKlar, k]);

  // Kameran: en gång — trakten, spåren och högarna i bild.
  const visaHela = useCallback((animera: boolean) => {
    const map = kartaRef.current;
    const v = vyRef.current;
    if (!map || !v) return;
    const b = new maplibregl.LngLatBounds();
    let n = 0;
    const med = (p: LngLat) => { b.extend(p); n++; };
    v.gran.flat().forEach(med);
    if (n === 0) { v.spar.flat().forEach(med); (v.hogar?.hogar ?? []).forEach((h) => med([h.lng, h.lat])); }
    if (n === 0) { if (v.mitt) map.jumpTo({ center: [v.mitt.lng, v.mitt.lat], zoom: 15 }); return; }
    map.fitBounds(b, { padding: AVSTAND.xxl * 2, maxZoom: 17, duration: animera ? 500 : 0 });
  }, []);
  useEffect(() => { if (kartaKlar && k && !kameraSatt.current) { kameraSatt.current = true; visaHela(false); } }, [kartaKlar, k, visaHela]);

  const sattLager = (id: Lager) => setLager((l) => { const ny = { ...l, [id]: !l[id] }; spara(LAGRING_LAGER, ny); return ny; });
  const sattBas = (b: BasId) => { setBas(b); spara(LAGRING_BAS, b); };

  // ---------------------------------------------------------------------------------------------------------------------------------------------
  if (lage.typ !== 'ok') {
    return (
      <main style={{ position: 'fixed', inset: 0, background: FARG.bg, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: AVSTAND.xl, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }} data-skotar-lage={lage.typ}>
          {lage.typ === 'laddar'
            ? <p style={{ ...TYP.rubrik, color: FARG.text2 }}>Hämtar kartan över trakten …</p>
            : <>
              <p style={{ ...TYP.rubrik, margin: `0 0 ${AVSTAND.l}px` }}>{lage.text}</p>
              {lage.status !== 404 && lage.status !== 410 && <button type="button" onClick={() => void hamta()} style={{ ...KNAPP.sekundar, minHeight: KNAPP_PX, padding: `0 ${AVSTAND.xl}px` }}>Försök igen</button>}
            </>}
        </div>
      </main>
    );
  }

  const v = lage.vy;
  const finns = k ? finnsLager(v, k) : STANDARD_LAGER;
  const ejPlacerad = v.origoText ? 'Kan inte placeras på kartan' : null;
  const saknas: Record<Lager, string> = {
    hogar: 'Inga högar med position', spar: 'Skördaren har inget spår här än', vagar: ejPlacerad ?? 'Inga vägar eller avlägg utsatta',
    fara: ejPlacerad ?? 'Ingen fara utmärkt', skydd: ejPlacerad ?? 'Inga sådana ytor på trakten', grans: 'Ingen traktgräns', ovrigt: ejPlacerad ?? 'Inget mer utsatt',
  };
  const kvar = v.hogar;
  const stangPanel = () => setPanel(null);
  // Raden överst: på telefonen som skickar säger den läget; på datorn bara när positionen är gammal.
  const gpsRad: { text: string; varning: boolean } | null = gps.telefon.typ !== 'av'
    ? { text: telefonText(gps.telefon), varning: ['langt', 'nekad', 'saknas', 'fel'].includes(gps.telefon.typ) }
    : gps.position && !gps.farsk ? { text: `Telefonens position: senast ${tid(gps.position.tid)}`, varning: true } : null;
  const valtAvlagg = avlaggRef ? v.avlagg?.find((a) => a.ref === avlaggRef) ?? null : null;
  const visningAv = (namn: string) => v.sortiment.find((x) => x.namn === namn)?.visning ?? namn;
  // Planerarens eller Vidas text om avlägget (bara läsning).
  const avlaggInfo: TryckKort | null = (() => {
    if (!valtAvlagg || valtAvlagg.kalla === 'egen') return null;
    if (valtAvlagg.kalla === 'plan') { const m = v.markeringar.find((x) => String(x.id) === valtAvlagg.ref.slice(5)); return m ? markeringKort(m, v.kommentarer) : null; }
    const f = v.vida.find((x) => x.properties._typ === 'punkt' && String(x.properties.EXTRA_LABE ?? x.properties.LOPNR ?? '').trim() === valtAvlagg.ref.slice(5));
    return f ? vidaKort(f.properties) : null;
  })();

  return (
    <main style={{ position: 'fixed', inset: 0, background: FARG.bg, color: FARG.text, fontFamily: 'Inter, -apple-system, system-ui, sans-serif', overflow: 'hidden', touchAction: 'none' }}>
      <div ref={behallare} style={{ position: 'absolute', inset: 0 }} data-skotar-karta="" data-klar={kartaKlar ? '' : undefined} />

      {/* Bara när något behöver sägas: annars syns ingenting ovanpå kartan. */}
      {(v.fel.length > 0 || gpsRad) && (
        <div style={{ position: 'absolute', top: AVSTAND.l, left: AVSTAND.l, right: AVSTAND.l, maxWidth: 520, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {v.fel.length > 0 && (
            <div role="status" data-skotar-fel="" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: 'rgba(28,28,30,0.92)', ...TYP.meta, color: FARG.orange }}>
              Kunde inte läsa {v.fel.join(', ')}. Sidan försöker igen av sig själv.
            </div>
          )}
          {gpsRad && (
            <div role="status" data-skotar-gps="" style={{ padding: `${AVSTAND.s}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: 'rgba(28,28,30,0.92)', ...TYP.meta, color: gpsRad.varning ? FARG.orange : FARG.text }}>
              {gpsRad.text}
            </div>
          )}
        </div>
      )}

      {/* EN knapp: + nere till höger, som i maskinerna. */}
      {placerar && (
        <div data-skotar-placerar="" style={{ position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: AVSTAND.s, borderRadius: RADIE.sheet, background: 'rgba(28,28,30,0.95)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ flex: 1, minWidth: 0, padding: `0 ${AVSTAND.s}px`, ...TYP.text }}>Tryck där avlägget ska ligga</div>
          <RundKnapp ikon="close" text="Avbryt" onClick={() => setPlacerar(false)} attr="placera-avbryt" />
        </div>
      )}

      {!ritar && !placerar && (
        <div style={{ position: 'absolute', bottom: AVSTAND.xxl, right: AVSTAND.l }}>
          <RundKnapp ikon="add" text="Meny" onClick={() => { setKort(null); setPanel('meny'); }} attr="plus" stor />
        </div>
      )}

      {/* Rita runt: EN rad nertill. */}
      {ritar && !ringKlar && (
        <div data-skotar-ritrad="" style={{ position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.s, padding: AVSTAND.s, borderRadius: RADIE.sheet, background: 'rgba(28,28,30,0.95)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ flex: 1, minWidth: 0, padding: `0 ${AVSTAND.s}px`, ...TYP.text }}>
            {ring.length < 3 ? 'Tryck ut hörnen runt högarna' : 'Tryck på första hörnet för att stänga'}
            <span style={{ color: FARG.text2 }}> · {ring.length} hörn</span>
          </div>
          <RundKnapp ikon="undo" text="Ta bort senaste hörnet" onClick={() => setRing((r) => r.slice(0, -1))} attr="angra-horn" av={ring.length === 0} />
          <RundKnapp ikon="check" text="Klar" onClick={() => { if (ring.length >= 3) setRingKlar(true); }} attr="ring-klar" av={ring.length < 3} gron />
          <RundKnapp ikon="close" text="Avbryt" onClick={slutaRita} attr="ring-avbryt" />
        </div>
      )}

      {kvitto && (
        <div role="status" data-skotar-kvitto="" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: AVSTAND.xxl + KNAPP_PX + AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.l, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, minHeight: KNAPP_PX, borderRadius: RADIE.sheet, background: 'rgba(28,28,30,0.95)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', ...TYP.text, whiteSpace: 'nowrap' }}>
          {kvitto.text}
          {kvitto.lass && <button type="button" data-skotar-angra="" onClick={() => void taBortLass(kvitto.lass!, true)} style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min }}>Ångra</button>}
        </div>
      )}

      {/* Svaret för det ritade området. */}
      {ritar && ringKlar && !vart && (
        <Ark rubrik="I området" stang="Klar" onStang={slutaRita}
          fot={omrade?.typ === 'ok' && omrade.svar.kvar > 0 ? (() => {
            // Inget ibockat = allt i området. Ibockat = bara de sortimenten, ett i taget till servern.
            const valda = omrade.svar.grupper.filter((g) => valdaGrupper.includes(g.grupp));
            const namn = valda.map((g) => g.namn);
            const text = valda.length === 0 ? 'Allt är taget' : `${namn.length > 1 ? `${namn.slice(0, -1).join(', ')} och ${namn[namn.length - 1]}` : namn[0]} är taget`;
            return (
              <button type="button" disabled={sparar} data-skotar-allt-taget=""
                onClick={() => taget({ plats: { ring }, grupper: valda.length === 0 ? [null] : valda.map((g) => g.grupp), text, klar: slutaRita })}
                style={{ ...KNAPP.primar, minHeight: KNAPP_PX, opacity: sparar ? 0.5 : 1 }}>{sparar ? 'Sparar …' : text}</button>
            );
          })() : undefined}>
          <div data-skotar-omrade="">
            {(!omrade || omrade.typ === 'laddar') && <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Räknar …</p>}
            {omrade?.typ === 'fel' && <p style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>Kunde inte räkna just nu. Försök igen.</p>}
            {omrade?.typ === 'ok' && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
                  <span style={{ ...TYP.tal }}>{tal(omrade.svar.kvar)}</span><span style={{ ...TYP.text }}>m³fub ligger kvar</span>
                </div>
                <div style={{ marginTop: AVSTAND.m }}>
                  {omrade.svar.grupper.map((g, i) => {
                    const valbar = VALBARA_GRUPPER.includes(g.grupp);
                    const vald = valdaGrupper.includes(g.grupp);
                    const rad = { display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.primar, padding: 0, background: 'none', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left' as const, ...TYP.text, ...TNUM };
                    const innehall = (
                      <>
                        <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', border: valbar ? `2px solid ${vald ? FARG.text : FARG.text3}` : 'none', background: vald ? FARG.text : 'transparent', color: FARG.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', ...TYP.meta }}>{vald ? '✓' : ''}</span>
                        <span style={{ flex: 1 }}>{g.namn}</span><span>{tal(g.m3)} m³fub</span>
                      </>
                    );
                    return valbar ? (
                      <button key={g.grupp} type="button" role="checkbox" aria-checked={vald} data-skotar-grupp={g.grupp}
                        onClick={() => setValdaGrupper((v) => (v.includes(g.grupp) ? v.filter((x) => x !== g.grupp) : [...v, g.grupp]))} style={{ ...rad, cursor: 'pointer' }}>{innehall}</button>
                    ) : <div key={g.grupp} style={rad}>{innehall}</div>;
                  })}
                  <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Bocka i det du har tagit. Inget ibockat = allt.</p>
                </div>
                <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
                  {omrade.svar.hogar === 0 ? 'Inga högar inne i området.' : `${omrade.svar.hogar} ${omrade.svar.hogar === 1 ? 'hög' : 'högar'} · skördat ${tal(omrade.svar.skordat)} m³fub`}
                </p>
              </>
            )}
            {sparFel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{sparFel}</p>}
            <button type="button" onClick={() => borjaRita()} style={{ ...KNAPP.sekundar, width: '100%', minHeight: KNAPP_PX, marginTop: AVSTAND.l }}>Rita nytt</button>
          </div>
        </Ark>
      )}

      {kort && !vart && (
        <KortArk kort={kort} token={token} sparar={sparar} fel={sparFel} onStang={() => { setKort(null); setSparFel(null); }}
          onTagen={() => {
            if (kort.typ !== 'hog') return;
            taget({ plats: { punkt: [kort.hog.lng, kort.hog.lat] }, grupper: [null], text: 'Högen är tagen', klar: () => setKort(null) });
          }} />
      )}

      {vart && v.avlagg && (
        <VartArk taget={vart} avlagg={v.avlagg} senaste={las<string>(`${LAGRING_SENASTE_AVLAGG}:${token}`, '')} sparar={sparar} fel={sparFel}
          onVal={(a) => void skickaTaget(vart, a)} onStang={() => { setVart(null); setSparFel(null); }} />
      )}

      {valtAvlagg && (
        <AvlaggArk avlagg={valtAvlagg} visning={visningAv} info={avlaggInfo} sparFel={sparFel}
          onStang={() => { setAvlaggRef(null); setSparFel(null); }}
          onTaBortLass={(id) => void taBortLass(id)}
          onTaBortAvlagg={valtAvlagg.kalla === 'egen' && valtAvlagg.lass === 0 ? () => void taBortAvlagg(valtAvlagg.ref) : undefined} />
      )}

      {panel === 'meny' && (
        <Ark rubrik={v.namn} stang="Klar" onStang={stangPanel}>
          <div data-skotar-meny="">
            <Rad titel="Rita runt högar" under="Se vad som ligger kvar i ett område" onTryck={() => borjaRita()} attr={{ 'data-meny': 'rita' }} />
            <Rad titel="Nytt avlägg" under="Tryck sedan där det ska ligga" onTryck={() => { stangPanel(); setAvlaggRef(null); setPlacerar(true); }} attr={{ 'data-meny': 'avlagg' }} />
            <Rad titel="Kvar på trakten" hoger={kvar && kvar.kvarM3 > 0 ? `${tal(kvar.kvarM3)} m³fub` : undefined} onTryck={() => setPanel('kvar')} attr={{ 'data-meny': 'kvar' }} />
            <Rad titel="Om trakten" onTryck={() => setPanel('om')} attr={{ 'data-meny': 'om' }} />
            <Rad titel="Kartans färger" onTryck={() => setPanel('forklaring')} attr={{ 'data-meny': 'forklaring' }} />
            <Rad titel="Lager" under={BAS_NAMN[bas]} onTryck={() => setPanel('lager')} attr={{ 'data-meny': 'lager' }} />
            <Rad titel="Visa hela trakten" onTryck={() => { stangPanel(); visaHela(true); }} attr={{ 'data-meny': 'hela' }} />
            {gps.position && <Rad titel="Visa var skotaren är" under={gps.farsk ? undefined : `Senast ${tid(gps.position.tid)}`} onTryck={() => { stangPanel(); visaMig(); }} attr={{ 'data-meny': 'var' }} />}
            <Rad titel="Använd telefonen som GPS" under={telefonText(gps.telefon)} hoger={gps.telefon.typ === 'av' ? undefined : 'På'}
              onTryck={() => { gps.sattPa(gps.telefon.typ === 'av'); if (gps.telefon.typ === 'av') stangPanel(); }} attr={{ 'data-meny': 'telefon-gps' }} />
            <Rad titel={helskarm ? 'Lämna helskärm' : 'Helskärm'} onTryck={() => { stangPanel(); vaxlaHelskarm(); }} pil={false} sista={!installera} attr={{ 'data-meny': 'helskarm' }} />
            {installera && <Rad titel="Lägg kartan som app på datorn" onTryck={() => { void installera.prompt().finally(() => setInstallera(null)); }} pil={false} sista attr={{ 'data-meny': 'installera' }} />}
            <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Håll fingret på kartan för att börja rita runt. Uppdaterad {klocka(v.uppdaterad)}.</p>
          </div>
        </Ark>
      )}

      {panel === 'kvar' && (
        <Ark rubrik="Kvar på trakten" stang="Klar" onStang={stangPanel}>
          <div data-skotar-kvar="">
            {kvar && kvar.kvarM3 > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
                  <span style={{ ...TYP.tal }} data-skotar-kvar-m3="">{tal(kvar.kvarM3)}</span><span style={{ ...TYP.text }}>m³fub kvar att skota</span>
                </div>
                <div style={{ marginTop: AVSTAND.m }}>
                  {kvar.kvar.map((t, i) => <SortimentRad key={t.namn} namn={t.visning} m3={t.m3} forsta={i === 0} />)}
                </div>
                <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Det skördaren lagt, minus det som skotats och det som markerats taget. Ungefär.</p>
              </>
            ) : <p style={{ margin: 0, ...TYP.text }}>{kvar ? 'Allt skördat är skotat' : 'Inga högar att visa än'}</p>}
          </div>
        </Ark>
      )}

      {panel === 'om' && (
        <Ark rubrik="Om trakten" stang="Klar" onStang={stangPanel}>
          <div data-skotar-om="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            <div style={{ ...TYP.listtitel }}>{v.namn}</div>
            {v.omTrakten.direktiv && <Textruta kalla="Vida · traktdirektiv" text={v.omTrakten.direktiv} />}
            {v.omTrakten.kommentarer.map((t, i) => <Textruta key={i} kalla="Planeraren" text={t} />)}
            {!v.omTrakten.direktiv && v.omTrakten.kommentarer.length === 0 && <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Inget skrivet om trakten.</p>}
            {v.origoText && <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{v.origoText}</p>}
          </div>
        </Ark>
      )}

      {panel === 'lager' && (
        <Ark rubrik="Visa på kartan" stang="Klar" onStang={stangPanel}>
          <div style={{ marginBottom: AVSTAND.l }}>
            <Flikkontroll flikar={[['foto', 'Flygfoto'], ['karta', 'Karta'], ['ritad', 'Ritad']] as const} aktiv={bas} onVal={(b) => sattBas(b)} />
            {bas === 'ritad' && <p data-ritad-status="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: ritad.status.typ === 'fel' ? FARG.orange : FARG.text2 }}>{ritad.text}</p>}
          </div>
          {LAGER.map((l, i) => (
            <Brytare key={l.id} id={l.id} namn={l.namn} pa={lager[l.id] && finns[l.id]} kan={finns[l.id]} under={finns[l.id] ? undefined : saknas[l.id]}
              sista={i === LAGER.length - 1} onVaxla={() => sattLager(l.id)} />
          ))}
        </Ark>
      )}

      {panel === 'forklaring' && (
        <div role="dialog" aria-modal="true" aria-label="Kartans färger" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'flex-end' }} onClick={stangPanel}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100vw)', height: '100%', background: FARG.bg, display: 'flex', flexDirection: 'column', paddingTop: AVSTAND.m }}>
            <VadBetyderKartan objektNamn="Kartan" roll="skotare"
              markeringar={v.markeringar as never} vida={vidaSlagIFeatures(v.vida)}
              onTillbaka={() => setPanel('meny')} onStang={stangPanel} />
          </div>
        </div>
      )}
    </main>
  );
}

function Textruta({ kalla, text }: { kalla: string; text: string }) {
  return (
    <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{kalla}</div>
      <div style={{ ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</div>
    </div>
  );
}

/** Arket för ett tryck: en markering/Vida-objekt (bara läsning), eller en hög (volymen + Tagen). */
function KortArk({ kort, token, sparar, fel, onStang, onTagen }: { kort: TryckKort; token: string; sparar: boolean; fel: string | null; onStang: () => void; onTagen: () => void }) {
  if (kort.typ === 'hog') {
    const h = kort.hog;
    return (
      <Ark rubrik="Högen" stang="Klar" onStang={onStang}
        fot={(
          <button type="button" disabled={sparar} onClick={onTagen} data-skotar-hog-tagen="" style={{ ...KNAPP.primar, minHeight: KNAPP_PX, opacity: sparar ? 0.5 : 1 }}>{sparar ? 'Sparar …' : 'Tagen'}</button>
        )}>
        <div data-skotar-hog="">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
            <span style={{ ...TYP.tal }}>{tal(h.m3)}</span><span style={{ ...TYP.text }}>m³fub ligger kvar här</span>
          </div>
          <div style={{ marginTop: AVSTAND.m }}>
            {h.sortiment.map((t, i) => <SortimentRad key={t.namn} namn={t.visning} m3={t.m3} forsta={i === 0} />)}
          </div>
          <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Det skördaren lade här, minus det som redan skotats. Ungefär — högen kan ligga några meter fel.</p>
          {fel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
        </div>
      </Ark>
    );
  }
  return (
    <Ark rubrik={kort.namn} stang="Klar" onStang={onStang}>
      <div data-skotar-markering="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {kort.forklaring && <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>{kort.forklaring}</p>}
        {kort.kommentarer.map((t, i) => (
          <p key={i} style={{ margin: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t}</p>
        ))}
        {kort.fotoId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/skotare/${token}/foto?id=${encodeURIComponent(kort.fotoId)}`} alt={kort.namn} style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: RADIE.kort, display: 'block', background: FARG.kort }} />
        )}
        {kort.kommentarer.length === 0 && !kort.fotoId && <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inget skrivet och inget foto.</p>}
      </div>
    </Ark>
  );
}

function RundKnapp({ ikon, text, onClick, attr, stor, av, gron }: { ikon: string; text: string; onClick: () => void; attr: string; stor?: boolean; av?: boolean; gron?: boolean }) {
  const px = stor ? 68 : KNAPP_PX;
  return (
    <button type="button" onClick={onClick} disabled={av} data-kartknapp={attr} aria-label={text} title={text}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: px, height: px, flexShrink: 0, padding: 0, overflow: 'hidden', borderRadius: RADIE.cirkel, border: `1px solid ${FARG.linje}`, background: gron && !av ? FARG.gron : FARG.kort, color: FARG.text, cursor: av ? 'default' : 'pointer', opacity: av ? 0.4 : 1, boxShadow: '0 2px 8px rgba(0,0,0,0.5)', touchAction: 'manipulation' }}>
      <Ikon namn={ikon} farg="inherit" storlek={stor ? 36 : 30} />
    </button>
  );
}

/** En rad med en brytare (på/av). En sak som inte finns går inte att slå på, och raden säger varför. */
function Brytare({ namn, pa, kan, under, sista, onVaxla, id }: { namn: string; pa: boolean; kan: boolean; under?: string; sista: boolean; onVaxla: () => void; id: string }) {
  return (
    <button type="button" role="switch" aria-checked={pa} disabled={!kan} onClick={onVaxla} data-lager={id}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: KNAPP_PX, padding: `${AVSTAND.s}px 0`, background: 'none', border: 'none', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, font: 'inherit', textAlign: 'left', cursor: kan ? 'pointer' : 'default', touchAction: 'manipulation' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.listtitel, color: kan ? FARG.text : FARG.text2 }}>{namn}</span>
        {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{under}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 51, height: 31, borderRadius: 16, padding: 2, boxSizing: 'border-box', flexShrink: 0, background: pa ? FARG.gron : FARG.upphojt, opacity: kan ? 1 : 0.4, display: 'flex', justifyContent: pa ? 'flex-end' : 'flex-start' }}>
        <span style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff' }} />
      </span>
    </button>
  );
}

function SortimentRad({ namn, m3, forsta }: { namn: string; m3: number; forsta: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, ...TYP.text, ...TNUM }}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{namn}</span><span style={{ whiteSpace: 'nowrap' }}>{tal(m3)} m³fub</span>
    </div>
  );
}

const tid = (iso: string) => {
  const d = new Date(iso);
  const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' }) === d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  const kl = d.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });
  return idag ? kl : `${d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' })} ${kl}`;
};

/** Avläggskortet: vad som körts dit (per sortiment) och det senaste. Det som körs dit kommer från "Tagen" — här finns inget att fylla i. */
function AvlaggArk({ avlagg, visning, info, sparFel, onStang, onTaBortLass, onTaBortAvlagg }: {
  avlagg: Avlagg; visning: (namn: string) => string; info: TryckKort | null; sparFel: string | null;
  onStang: () => void; onTaBortLass: (id: string) => void; onTaBortAvlagg?: () => void;
}) {
  const [fraga, setFraga] = useState<string | null>(null);
  return (
    <Ark rubrik={avlagg.nr ? `Avlägg ${avlagg.nr}` : 'Avlägg'} stang="Klar" onStang={onStang}>
      <div data-skotar-avlagg="">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
          <span style={{ ...TYP.tal }}>{tal(avlagg.m3)}</span>
          <span style={{ ...TYP.text }}>m³fub hit</span>
        </div>
        {avlagg.sortiment.length > 0 && (
          <div style={{ marginTop: AVSTAND.m }}>
            {avlagg.sortiment.map((t, i) => <SortimentRad key={t.namn} namn={visning(t.namn)} m3={t.m3} forsta={i === 0} />)}
          </div>
        )}
        {avlagg.lass === 0 && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Inget kört hit än. Markera det du tagit på kartan (Tagen) så hamnar det här.</p>}
        {avlagg.senaste.length > 0 && (
          <>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.l }}>Senast</div>
            {avlagg.senaste.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, ...TYP.text, ...TNUM }}>
                <span style={{ flex: 1 }}>{tid(l.tid)} · {tal(l.m3)} m³</span>
                <button type="button" data-skotar-tabort-lass={l.id} onClick={() => { if (fraga === l.id) { setFraga(null); onTaBortLass(l.id); } else setFraga(l.id); }}
                  style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min, color: fraga === l.id ? FARG.rod : FARG.bla }}>{fraga === l.id ? 'Ta bort?' : 'Ta bort'}</button>
              </div>
            ))}
          </>
        )}
        {info && (info.typ === 'markering') && (info.forklaring || info.kommentarer.length > 0) && (
          <div style={{ marginTop: AVSTAND.l, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {info.kommentarer.map((t, i) => <p key={i} style={{ margin: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t}</p>)}
          </div>
        )}
        {sparFel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{sparFel}</p>}
        {onTaBortAvlagg && (
          <button type="button" onClick={() => { if (fraga === 'avlagg') { setFraga(null); onTaBortAvlagg(); } else setFraga('avlagg'); }}
            style={{ ...KNAPP.sekundar, width: '100%', minHeight: KNAPP_PX, marginTop: AVSTAND.l, color: fraga === 'avlagg' ? FARG.rod : FARG.text }}>{fraga === 'avlagg' ? 'Ta bort avlägget?' : 'Ta bort avlägget'}</button>
        )}
      </div>
    </Ark>
  );
}

/** Vart körde du det? En rad per avlägg — det han senast körde till först, sedan i nummerordning. Ett tryck sparar. */
export function ordnaAvlagg(avlagg: readonly Avlagg[], senaste: string): Avlagg[] {
  const nr = (a: Avlagg) => (/^\d+$/.test(a.nr) ? Number(a.nr) : Infinity);
  return [...avlagg].sort((a, b) => Number(b.ref === senaste) - Number(a.ref === senaste) || nr(a) - nr(b) || a.nr.localeCompare(b.nr, 'sv'));
}

function VartArk({ taget, avlagg, senaste, sparar, fel, onVal, onStang }: {
  taget: Taget; avlagg: readonly Avlagg[]; senaste: string; sparar: boolean; fel: string | null; onVal: (a: Avlagg) => void; onStang: () => void;
}) {
  const lista = ordnaAvlagg(avlagg, senaste);
  return (
    <Ark rubrik="Vart körde du det?" onStang={onStang}>
      <div data-skotar-vart="">
        <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.meta, color: FARG.text2 }}>{taget.text}</p>
        {lista.map((a, i) => (
          <Rad key={a.ref} titel={a.nr ? `Avlägg ${a.nr}` : 'Avlägg'} under={a.ref === senaste ? 'Senast' : undefined} hoger={a.m3 > 0 ? `${tal(a.m3)} m³fub` : undefined}
            onTryck={() => { if (!sparar) onVal(a); }} sista={i === lista.length - 1} attr={{ 'data-skotar-vart-avlagg': a.ref }} />
        ))}
        {sparar && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Sparar …</p>}
        {fel && <p role="alert" style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Saknas avlägget? Stäng och välj + › Nytt avlägg.</p>
      </div>
    </Ark>
  );
}
