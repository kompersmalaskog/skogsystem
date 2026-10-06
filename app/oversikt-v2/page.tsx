'use client';
// ── Översikt v2 (SLUTLIG) — kartan ÄR hela sidan ──────────────────────────────
// Skördare: nästa = förmannens kö (numrerad rutt 1→2). Skotare: automatiskt, roll-
// filtrerat. Förare landar på egen maskin, ser Nu + 1 + 2. Förman: hela flottan,
// tryck maskin = kön som rutt, tryck objekt = lägg i kö. Ringar = väntar. Zoom styr
// täthet. Inga flikar, inget filter, inga inställningar. Ljus förarkarta, mörka chip.
// Alla km = ORS-vägavstånd eller "–". Rör inte gamla /oversikt eller planeringen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { maskinVisningsnamn } from '@/lib/maskinNamn';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from '../oversikt/forarkarta-stil';
import type { OversiktObjekt, Maskin, MaskinKoItem } from '../oversikt/oversikt-types';
import { STATUS_AKTIV, STATUS_AVSLUTADE } from '../oversikt/oversikt-types';
import { hamtaSenastePlatser, dagarSedan, type PlatsForslag } from '../maskinflytt/senastePlats';
import { paBackenKvar } from '@/lib/skotat';
import { hamtaSkordMapV2, type SkordAggV2 } from './skord-data';
import { beraknaForslag, arSkotare, maskinAktiv, tomtForslag, koNamn, arGrotKo, type MaskinForslag, type MaskinRad, type MaskinTyp, type KoPost } from './nasta-v2';
import { arbetsLage } from './lage';
import { koLaget } from './ko-regler';
import { barighetText, byggVarningar, telHref, type MarkeringRow, type ObjWarn } from './objekt-info';
import { KO_LASFEL, KO_SPARFEL, flyttaKoVerifierat, laggIKoVerifierat, lasKo, skapaKoKedja, skrivOrdningVerifierat, taBortKoVerifierat, type KoSvar } from './ko-skriv';
import { arIos, forstaNamn, maskinOrd, rensaObjektnamn, smsHref, smsText, type MaskinOrd } from './sms';
import { hamtaGrotRaw } from '@/lib/grotvy/hamta';
import { byggGrotLista, grotKordaObjektIds, grotSnartAntal, grotVantandeObjektIds, medDimPatch, type GrotRad, type GrotRaw, type GrotSkrivning } from '@/lib/grotvy/lista';
import { arGrotUnderlagTillforlitligt, koRaderAttRensa, raderaKoRader } from '@/lib/grotvy/ko';
import { avstandText, grotChipText } from '@/lib/grotvy/format';
import { bradskandeFor, type Bradskande } from '@/lib/grotvy/kartprick';
import { narmasteVag } from '@/lib/grotvy/avstand';
import { sparaFalt } from '@/lib/redigering/objektRouter';
import GrotListaArk, { ARK_ANDEL, type ArkLage } from './GrotLista';
import GrotObjektArk, { type ArkKo, type ArkSkotare } from './GrotObjektArk';
import { useGrotVagAvstand } from './grot-avstand';
import { KNAPP, KNAPP_LITEN, SheetBas, Grabber, VarningRader } from './ark-delar';
import { FARG, TYP, AVSTAND, RADIE, FONT, TNUM, INAKTIV, designCss } from '@/lib/design/tokens';

declare global { interface Window { maplibregl: any } }

const CHIP_BG = 'rgba(28,28,30,0.94)';
const GRAY_LINE = 'rgba(72,72,74,0.95)';
const LIT_LINE = '#1c1c1e';
const GRAY_DOT = '#636366';
const THRESHOLD_ZOOM = 11; // < detta = översikt (bara maskiner + pågående + ringar); ≥ = allt

const fmt = (n: number) => Math.round(n).toLocaleString('sv-SE');
function kortDatum(d: string | null): string {
  if (!d) return '';
  return new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const PAGE = 1000; const all: T[] = []; let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await query().range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
/** ORS-vägavstånd via /api/routing. Bara source cache/ors räknas; annars null → "–". Aldrig fågelväg. */
async function vagKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<number | null> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}`);
    const j = await r.json();
    return (typeof j.km === 'number' && (j.source === 'cache' || j.source === 'ors')) ? j.km : null;
  } catch { return null; }
}
export type Rutt = { km: number | null; geom: [number, number][] | null };
/** Vägrutt (km + ORS-geometri) via /api/routing?withGeometry=1. km knyts till geometrin: finns ingen
 *  geometri (ORS-miss/fallback) → km null OCH geom null, så kartans siffra och linje ALLTID stämmer. */
async function vagRutt(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Rutt> {
  try {
    const r = await fetch(`/api/routing?fromLat=${from.lat}&fromLng=${from.lng}&toLat=${to.lat}&toLng=${to.lng}&withGeometry=1`);
    const j = await r.json();
    const geom: [number, number][] | null = Array.isArray(j.geometry) ? j.geometry : null;
    if (!geom) console.warn(`[oversikt-v2] ingen väggeometri ${from.lat.toFixed(3)},${from.lng.toFixed(3)}→${to.lat.toFixed(3)},${to.lng.toFixed(3)}: ${j.orsError ?? j.source}`); // skäl i konsolen
    return { km: geom && typeof j.km === 'number' ? j.km : null, geom };
  } catch { return { km: null, geom: null }; }
}

// Faror och hänsyn (med planerarens kommentar) byggs i objekt-info.ts. Raden i maskin-arket visar bara den första (kort);
// objekt-arket visar alla.
const varnText = (w: ObjWarn | undefined): { text: string; color: string } | null =>
  w && w.faror.length ? { text: `fara: ${w.faror[0].label}`, color: FARG.rod }
    : w && w.hansyn.length ? { text: `hänsyn: ${w.hansyn[0].label}`, color: FARG.orange } : null;

const harMaskin = (o: OversiktObjekt) => !!((o as any).skordare_maskin_id || (o as any).skotare_maskin_id);

// Prick/ring per objekt. form:'ring' = väntar (planerad OCH otilldelad). 'fill' = fylld.
// utzoom = visas även utzoomad. Utzoomat göms BARA avslutade → allt annat (pågår/planerad/kö/ring) = true.
// namnbar = får namn-etikett vid inzoomning (pågår/planerad/väntar). Avslutade aldrig.
// halo = vit ytterkant + mörk kontur för att lyfta från ljus topografi (ej avslutade).
// etikett = GROT-läget, trakt MED markägarens datum (lib/grotvy/kartprick): en liten skylt bredvid pricken som syns på
// ALLA zoomnivåer (namnet först från z11) och en kraftigare vit halo. Utan etikett är pricken som förut.
interface DotDesc { form: 'ring' | 'fill'; color: string; opacity: number; size: number; utzoom: boolean; namnbar: boolean; halo: boolean; etikett?: { text: string; farg: string } }
// iKo = objektet ligger i någon maskins maskin_ko → räknas som tilldelat (grå prick, aldrig ring).
// grot = trakten väntar på GROT (lib/grotvy): 'vantar' = en avslutad trakt som ändå ska besökas behåller sin bleka
// prick (fast opacitet, ingen 180-dagarsgräns); 'oppen' = GROT-arket är öppet → pricken syns på alla zoomnivåer
// och i GROT-färg, så man ser vilka trakter listan handlar om och kan flyga dit.
const GROT_PRICK: DotDesc = { form: 'fill', color: FARG.diagram2, opacity: 1, size: 16, utzoom: true, namnbar: true, halo: true };
// Brådskande GROT-prick: större (20 px), MÖRKARE orange än GROT_PRICK, röd när markägarens datum har passerat. Orange-nyansen är
// en egen konstant (ingen token): Martins beställning 2026-10-04 — byt här om nyansen ska justeras. Etikettens text är token-färg.
const GROT_BRADSKANDE = '#e8710a';
function bradskandePrick(b: Bradskande): DotDesc {
  const forsenad = b.typ === 'forsenad';
  return { form: 'fill', color: forsenad ? FARG.rod : GROT_BRADSKANDE, opacity: 1, size: 20, utzoom: true, namnbar: true, halo: true, etikett: { text: b.text, farg: forsenad ? FARG.rod : FARG.orange } };
}
function dotDesc(o: OversiktObjekt, iKo: boolean, grot: false | 'vantar' | 'oppen' = false): DotDesc | null {
  if (STATUS_AKTIV.includes(o.status)) return { form: 'fill', color: FARG.gron, opacity: 1, size: 18, utzoom: true, namnbar: true, halo: true }; // pågår = grön
  if (o.status === 'planerad') {
    return (harMaskin(o) || iKo)
      ? { form: 'fill', color: GRAY_DOT, opacity: 0.95, size: 16, utzoom: true, namnbar: true, halo: true }  // tilldelad (maskin el. kö) = grå, syns även utzoomat
      : { form: 'ring', color: GRAY_DOT, opacity: 1, size: 18, utzoom: true, namnbar: true, halo: true };  // väntar = ihålig ring
  }
  if (STATUS_AVSLUTADE.includes(o.status)) {
    if (grot === 'oppen') return GROT_PRICK;
    if (grot) return { form: 'fill', color: GRAY_DOT, opacity: 0.42, size: 13, utzoom: false, namnbar: false, halo: false }; // GROT väntar: samma bleka prick, bleknar inte bort
    const d = (o as any).avslutad_timestamp || o.faktisk_slut || null;
    if (!d) return null;
    const age = dagarSedan(d);
    if (age > 180) return null;
    return { form: 'fill', color: GRAY_DOT, opacity: Math.max(0.1, 0.42 - (age / 180) * 0.32), size: 13, utzoom: false, namnbar: false, halo: false }; // avslutad, bleknar — orörd
  }
  return null;
}

const nastaAv = (f: MaskinForslag) => f.ko[0]?.objekt ?? null;
// En rad i '+ Lägg till objekt'-väljaren. koMaskinNamn = maskin av SAMMA roll som redan har objektet i kön (spärr: raden går
// inte att välja). koInfo = maskin av ANNAN roll som har det i kön (bara info — en skotare får lägga det en skördare har i
// kön, och tvärtom).
type LaggKand = { id: string; namn: string; atgard: string; m3: number | null; lat: number; lng: number; koMaskinNamn: string | null; koInfo: string | null };
// Routing-ORIGO: står maskinen på ett känt objekt → rutta från OBJEKTETS koordinat (stabil, nära väg),
// inte stam-GPS:en mitt i beståndet. Markören står kvar på f.koordinat. Fallback: positionen.
function ruttStart(f: MaskinForslag): { lat: number; lng: number } | null {
  const o = f.nuObjekt;
  if (o && o.lat != null && o.lng != null) return { lat: o.lat, lng: o.lng };
  return f.koordinat ?? null;
}
// Utgångspunkt för avstånden i '+ Lägg till objekt'. Maskinens läge — och saknar maskinen position (t.ex. en skotare som aldrig
// skickar filer) räknas avstånden från det FÖRSTA köobjektet. Finns inte ens det: ingen utgångspunkt, raderna visar '–'.
function laggStart(f: MaskinForslag): { lat: number; lng: number } | null {
  const lage = ruttStart(f); if (lage) return lage;
  const forsta = f.ko.find((p) => p.kalla === 'ko' && p.objekt.lat != null && p.objekt.lng != null);
  return forsta ? { lat: forsta.objekt.lat!, lng: forsta.objekt.lng! } : null;
}

export default function OversiktV2Page() {
  const { medarbetare, loading: rollLaddar } = useCurrentMedarbetare();

  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [warnings, setWarnings] = useState<Record<string, ObjWarn>>({});
  const [skord, setSkord] = useState<Record<string, SkordAggV2>>({});
  const [positions, setPositions] = useState<Map<string, PlatsForslag>>(new Map());
  const [platserKlar, setPlatserKlar] = useState(false); // positionerna är lästa (eller läsningen misslyckades) — förrän dess vet vi inte vilka maskiner som saknar position
  const [telByMaskin, setTelByMaskin] = useState<Record<string, string>>({});
  const [ruttVersion, setRuttVersion] = useState(0); // bumpas när rutt-cachen fyllts → rita om km/linjer
  const [highlightObjekt, setHighlightObjekt] = useState<string | null>(null); // prick som markeras under fingret i '+ Lägg till objekt'
  // GROT (lib/grotvy): råa rader → lista (grotLista) → objekt.id-mängden som släpper in avslutade trakter i kön.
  const [grotRaw, setGrotRaw] = useState<GrotRaw | null>(null);
  const [grotKlar, setGrotKlar] = useState<'laddar' | 'klar' | 'fel'>('laddar');
  const [grotOppen, setGrotOppen] = useState(false);          // GROT-arket (listan eller ett objekt) är öppet
  const [grotValt, setGrotValt] = useState<string | null>(null); // dim_objekt.objekt_id för raden som är vald i listan

  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState(false);
  const [selMaskin, setSelMaskin] = useState<string | null>(null);
  const [selObjekt, setSelObjekt] = useState<string | null>(null); // förman tryckte på en prick
  const [zoomNiva, setZoomNiva] = useState(9);
  const [koPreview, setKoPreview] = useState<OversiktObjekt[] | null>(null); // live drag-ordning för vald maskin

  // Klient-cache av vägrutt (km + geometri) per koordinatpar. Under drag läses BARA härifrån
  // (inga routing-anrop mitt i ett drag); vagRuttCached fyller den, legKm/legGeom slår upp synkront.
  const ruttCacheRef = useRef<Map<string, Rutt>>(new Map());
  const cacheKey = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => `${a.lat.toFixed(3)},${a.lng.toFixed(3)};${b.lat.toFixed(3)},${b.lng.toFixed(3)}`;
  const vagRuttCached = useCallback(async (from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Rutt> => {
    const k = cacheKey(from, to); const c = ruttCacheRef.current;
    const have = c.get(k); if (have && have.geom) return have; // bara geometri-träff är en riktig träff
    const rutt = await vagRutt(from, to); c.set(k, rutt); return rutt;
  }, []);
  const legKmCache = useCallback((from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): number | null => (from && to ? ruttCacheRef.current.get(cacheKey(from, to))?.km ?? null : null), []);
  const legGeomCache = useCallback((from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): [number, number][] | null => (from && to ? ruttCacheRef.current.get(cacheKey(from, to))?.geom ?? null : null), []);

  const refetchKo = useCallback(async () => {
    const { data } = await supabase.from('maskin_ko').select('*').order('ordning');
    if (data) setMaskinKo(data as MaskinKoItem[]);
  }, []);

  const fetchAll = useCallback(async () => {
    setFel(false); setLaddar(true); setGrotKlar('laddar'); setPlatserKlar(false);
    let objRows: OversiktObjekt[]; let maskinRows: Maskin[];
    try {
      const [obj, maskinerRes, koRes, markRes] = await Promise.all([
        fetchAllRows<OversiktObjekt>(() => supabase.from('objekt').select('*').order('namn').order('id')),
        supabase.from('dim_maskin').select('*').order('modell'),
        supabase.from('maskin_ko').select('*').order('ordning'),
        supabase.from('planering_markeringar').select('objekt_id, typ, data'),
      ]);
      objRows = obj; maskinRows = (maskinerRes.data || []) as Maskin[];
      if (!objRows.length || !maskinRows.length) throw new Error('tom kärndata');
      setObjekt(objRows); setMaskiner(maskinRows);
      setMaskinKo((koRes.data || []) as MaskinKoItem[]);
      setWarnings(byggVarningar((markRes.data || []) as MarkeringRow[]));
    } catch (e) {
      console.error('[Översikt v2] kunde inte läsa kärndata', e);
      setFel(true); setLaddar(false); return;
    }
    setLaddar(false);
    const ids = Array.from(new Set(maskinRows.map((m) => m.maskin_id).filter(Boolean))) as string[];
    const [platserRes, skordRes, telRes, grotRes] = await Promise.allSettled([
      hamtaSenastePlatser(ids), hamtaSkordMapV2(),
      supabase.from('medarbetare').select('maskin_id, telefon, roll').not('maskin_id', 'is', null),
      hamtaGrotRaw(supabase),
    ]);
    if (platserRes.status === 'fulfilled') setPositions(platserRes.value.platser);
    setPlatserKlar(true); // även vid fel: då vet vi inte var någon står, och maskinerna listas som utan position (och går att öppna)
    // Misslyckas GROT-läsningen: ingen chip, GROT-trakter syns inte i kön, ingen kö-rensning — resten orört.
    if (grotRes.status === 'fulfilled') { setGrotRaw(grotRes.value); setGrotKlar('klar'); } else { console.error('[Översikt v2] kunde inte läsa GROT', grotRes.reason); setGrotKlar('fel'); }
    if (skordRes.status === 'fulfilled') setSkord(skordRes.value);
    if (telRes.status === 'fulfilled' && telRes.value.data) {
      const t: Record<string, string> = {};
      for (const r of telRes.value.data as { maskin_id: string; telefon: string | null }[]) if (r.maskin_id && r.telefon && !t[r.maskin_id]) t[r.maskin_id] = r.telefon;
      setTelByMaskin(t);
    }
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const maskinKoIds = useMemo(() => new Set(maskinKo.map((k) => k.maskin_id)), [maskinKo]);
  const koObjektIds = useMemo(() => new Set(maskinKo.map((k) => k.objekt_id)), [maskinKo]); // objekt som ligger i någon kö = tilldelade
  const todayISO = useMemo(() => new Date().toLocaleDateString('sv-SE'), []);
  const aktivaMaskiner = useMemo(
    () => maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && (positions.get(m.maskin_id)?.koordinat != null || maskinKoIds.has(m.maskin_id))),
    [maskiner, positions, maskinKoIds, todayISO],
  );

  // GROT-listan (lib/grotvy) — EN lista för chippen, arket och kön. "Står här" kräver lägen + aktiva skotare.
  const grotSkotare = useMemo<ArkSkotare[]>(() => aktivaMaskiner.filter((m) => arSkotare(m as MaskinRad)).map((m) => ({
    id: m.maskin_id, namn: maskinVisningsnamn(m) || m.maskin_id, roll: ((m as any).skotar_roll as string | null) ?? null, koordinat: positions.get(m.maskin_id)?.koordinat ?? null,
  })), [aktivaMaskiner, positions]);
  const grotLista = useMemo(() => grotRaw ? byggGrotLista(grotRaw, { idag: todayISO, platser: positions, skotare: grotSkotare.map((s) => ({ id: s.id, namn: s.namn })) }) : null, [grotRaw, todayISO, positions, grotSkotare]);
  const grotIds = useMemo(() => grotLista ? grotVantandeObjektIds(grotLista) : new Set<string>(), [grotLista]); // objekt.id som släpps in i kön trots avslutad status
  const grotSnart = useMemo(() => grotLista ? grotSnartAntal(grotLista) : 0, [grotLista]); // markägarens datum inom 7 dagar (eller förbi) — chippen blir orange

  const forslag = useMemo(() => {
    const ut = aktivaMaskiner.length
      ? beraknaForslag({ maskiner: aktivaMaskiner as MaskinRad[], objekt, maskinKo, skord, positions, avstandKm: (a, b) => haversineKm(a, b), grotObjektIds: grotIds })
      : new Map<string, MaskinForslag>();
    // En aktiv maskin utan position OCH utan kö (t.ex. en skotare som aldrig skickar filer) ritas inte och räknas inte med i
    // beräkningen — men den ska gå att öppna och lägga i kö för. Den läggs till EFTER beräkningen (ett tomt förslag), så ingen
    // annan maskins förslag påverkas. Så fort den får en kö räknas den som vilken maskin som helst.
    for (const m of maskiner) if (maskinAktiv(m as MaskinRad, todayISO) && !ut.has(m.maskin_id)) ut.set(m.maskin_id, tomtForslag(m as MaskinRad));
    return ut;
  }, [aktivaMaskiner, objekt, maskinKo, skord, positions, grotIds, maskiner, todayISO]);

  // Vägrutt (km + geometri) hämtas BARA för vald maskins fasta kö-ordning. Etiketten visar inga km
  // (behöver inga anrop för hela flottan). Beror på [selMaskin, forslag] — inte koPreview → inga
  // anrop under drag; en ny ordning hämtas vid släpp (forslag uppdateras då). Fyller rutt-cachen.
  useEffect(() => {
    if (!selMaskin) return;
    const f = forslag.get(selMaskin); if (!f || !f.ko.length) return; // en maskin utan position har ingen första sträcka (ruttStart null) men sträckorna mellan köobjekten räknas
    let cancelled = false;
    (async () => {
      const punkter = [ruttStart(f), ...f.ko.map((p) => (p.objekt.lat != null && p.objekt.lng != null ? { lat: p.objekt.lat, lng: p.objekt.lng } : null))];
      for (let i = 1; i < punkter.length; i++) { const a = punkter[i - 1], b = punkter[i]; if (a && b) await vagRuttCached(a, b); }
      if (!cancelled) setRuttVersion((v) => v + 1);
    })();
    return () => { cancelled = true; };
  }, [selMaskin, forslag, vagRuttCached]);

  // Rollen → vad vyn tillåter (lage.ts). FAIL-CLOSED: bara admin/chef kan redigera. Förare är i läsläge på ALLA maskiner och
  // objekt — inte bara på sin egen. En förare utan giltig maskin, och en okänd/saknad roll, får kartan och inget mer (inga ark,
  // inga knappar). Förut räknades varje "inte förare på sin egen maskin" som förman, så en förare som tryckte på en annan
  // maskin (eller saknade maskin_id) fick förmannens kö-knappar.
  const lage = useMemo(() => arbetsLage({ roll: medarbetare?.roll, rollLaddar, maskinId: medarbetare?.maskin_id, maskiner: laddar ? null : (maskiner as MaskinRad[]), idag: todayISO }),
    [medarbetare, rollLaddar, laddar, maskiner, todayISO]);
  const kanRedigera = lage.typ === 'forman';                           // kö-knappar, GROT-chip och -redigering, städning av GROT-kön
  const kanOppnaArk = lage.typ === 'forman' || lage.typ === 'forare';  // maskin- och objekt-ark
  const egenMaskinId = lage.typ === 'forare' ? lage.maskinId : null;
  const fornamn = useMemo(() => forstaNamn(medarbetare?.namn), [medarbetare?.namn]); // sms till markägaren skrivs i den inloggades namn
  const kanOppnaArkRef = useRef(kanOppnaArk); kanOppnaArkRef.current = kanOppnaArk; // marker- och prick-lyssnarna sätts en gång vid skapandet
  const didAutoSelect = useRef(false);
  // Djuplänk ?objekt=<objekt.id> (för länkar från andra vyer): kartan centreras på objektet och dess ark öppnas.
  // `klar` = länken är hanterad (eller visade sig ogiltig). Medan den väntar rör varken auto-inpassningen eller
  // förarens auto-val kameran/urvalet. Läses ur window.location.search i en effekt — inte useSearchParams, som
  // kräver en Suspense-gräns runt hela sidan.
  const djupLankRef = useRef<{ id: string | null; klar: boolean }>({ id: null, klar: true });
  const [djupLankKlar, setDjupLankKlar] = useState(false); // bumpas när en ogiltig länk släpper kameran → auto-inpassningen får köra
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('objekt');
    if (id) djupLankRef.current = { id, klar: false };
  }, []);
  useEffect(() => {
    if (didAutoSelect.current || rollLaddar || laddar) return;
    if (djupLankRef.current.id) { didAutoSelect.current = true; return; } // djuplänken äger urvalet
    if (lage.typ === 'forare') { if (platserKlar && forslag.has(lage.maskinId)) { setSelMaskin(lage.maskinId); didAutoSelect.current = true; } } // förarens egen maskin (väntar in positionerna, så arket öppnas en gång med rätt innehåll)
    else if (lage.typ !== 'laddar') didAutoSelect.current = true; // förman — och en förare utan giltig maskin, som inte får något ark alls
  }, [lage, platserKlar, forslag, rollLaddar, laddar]);

  // Ett ark i taget: väljs en maskin eller ett vanligt objekt stängs GROT-arket. (Öppnas GROT nollas urvalet i oppnaGrot.)
  useEffect(() => { if (selMaskin || selObjekt) { setGrotOppen(false); setGrotValt(null); } }, [selMaskin, selObjekt]);

  // Kvarlevor efter GROT: GROT-köraden tas bort automatiskt när körd-regeln slår (grot_hamtad satt eller länkat risjobb
  // klart) — samma regel som listan (lib/grotvy/lista arKord). Bara kö-rader på AVSLUTADE trakter där GROT är körd; en
  // avslutad trakt som aldrig var GROT rörs inte. En gång per laddning, bara för förman (aldrig förare eller okänd roll), och
  // bara på ett underlag som går att lita på (en tyst tom läsning får inte tolkas som "allt är körda"). Raderingen bekräftas
  // med samma predikat.
  const grotStadat = useRef(false);
  useEffect(() => {
    if (grotKlar === 'laddar') { grotStadat.current = false; return; }
    if (laddar || fel || rollLaddar || !kanRedigera || grotStadat.current) return;
    grotStadat.current = true;
    if (grotKlar !== 'klar' || !grotRaw || !arGrotUnderlagTillforlitligt(grotRaw)) return;
    const ids = koRaderAttRensa(maskinKo, objekt, grotKordaObjektIds(grotRaw));
    if (!ids.length) return;
    (async () => {
      const r = await raderaKoRader(supabase, ids);
      console.info(`[Översikt v2] GROT-kö: ${r.ok ? 'rensade' : 'kunde INTE rensa'} ${ids.length} kö-rad(er) där GROT är körd`, r.ok ? ids : r.message);
      await refetchKo();
    })();
  }, [grotKlar, grotRaw, laddar, fel, rollLaddar, kanRedigera, maskinKo, objekt, refetchKo]);

  // ══ KARTA ══
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const machMarkersRef = useRef<Map<string, { marker: any; container: HTMLDivElement; square: HTMLDivElement; label: HTMLDivElement; sub: HTMLDivElement }>>(new Map());
  // grot = pricken hör till GROT-listan (GROT-arket är öppet): den behåller full styrka medan övriga prickar dämpas.
  // label = skylten bredvid pricken: [datum] [namn]. datum (brådskande GROT-trakt) syns på alla zoomnivåer, namnet först från z11.
  const dotsRef = useRef<Map<string, { marker: any; el: HTMLDivElement; circle: HTMLDivElement; label: HTMLDivElement; datum: HTMLSpanElement; namn: HTMLSpanElement; desc: DotDesc; grot: boolean }>>(new Map());
  const ordnaRef = useRef(false); // true medan "Ändra ordning" är öppet → kartan rör sig inte av sig själv
  const stopMarkersRef = useRef<any[]>([]); // numrerade rutt-cirklar + on-map-etiketter
  const clusterMarkersRef = useRef<any[]>([]); // ihopslagna maskin-markörer ("N maskiner")
  const highlightMarkerRef = useRef<any>(null); // prick under fingret i '+ Lägg till objekt'-väljaren
  const didFitRef = useRef(false);
  const forslagRef = useRef(forslag); forslagRef.current = forslag;
  const grotOppenRef = useRef(grotOppen); grotOppenRef.current = grotOppen; // GROT-arket öppet → bara skotare + GROT-prickar syns (layoutMachines, restyleSelection)
  const selRef = useRef(selMaskin); selRef.current = selMaskin;
  const zoomRef = useRef(zoomNiva); zoomRef.current = zoomNiva;
  const koPreviewRef = useRef(koPreview); koPreviewRef.current = koPreview;
  // Vald maskins kö-objekt — live-preview under drag, annars ur forslag.
  const valdKoObjekt = useCallback((mid: string | null): OversiktObjekt[] => {
    if (!mid) return [];
    if (koPreviewRef.current) return koPreviewRef.current;
    return (forslagRef.current.get(mid)?.ko ?? []).map((p) => p.objekt);
  }, []);

  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversiktv2')) {
      const link = document.createElement('link'); link.id = 'maplibre-css-oversiktv2'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.appendChild(link);
    }
    if (!window.maplibregl) {
      const s = document.createElement('script'); s.id = 'maplibre-js-oversiktv2';
      s.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; s.onload = () => setMapReady(true); document.head.appendChild(s);
    } else setMapReady(true);
  }, []);

  // Etiketten är en SKYLT, inte en mening: maskinnamnet (name-div) + "→ nästa". Inga km (de bor i arket).
  const sublabelText = useCallback((f: MaskinForslag): string => {
    const nasta = nastaAv(f);
    return nasta ? `→ ${koNamn(nasta)}` : '· inget planerat';
  }, []);

  const layoutLabels = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const items: { label: HTMLDivElement; x: number; y: number }[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      if (mm.label.style.display === 'none') return; // ihopslagen/dold maskin — hoppa över
      const f = forslagRef.current.get(mid); if (!f?.koordinat) return;
      const p = map.project([f.koordinat.lng, f.koordinat.lat]); items.push({ label: mm.label, x: p.x, y: p.y });
    });
    items.sort((a, b) => a.y - b.y);
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const LW = 200, LH = 28, GAP = 6, LEFT = 16;
    for (const it of items) {
      const left = it.x + LEFT; let top = it.y - LH / 2; let guard = 0;
      while (guard++ < 24) { const hit = placed.find((r) => !(left > r.x2 || left + LW < r.x1 || top > r.y2 || top + LH < r.y1)); if (!hit) break; top = hit.y2 + GAP; }
      it.label.style.transform = `translateY(${Math.round(top - (it.y - LH / 2))}px)`;
      placed.push({ x1: left, y1: top, x2: left + LW, y2: top + LH });
    }
    // Objekt-skyltar (datum + namn) placeras EFTER maskin-etiketterna (som därmed vinner en kollision → en prick-skylt
    // hamnar aldrig ovanpå en maskinetikett). Bara synliga skyltar, de-överlappas vertikalt mot varandra. Brådskande
    // datumskyltar (GROT-läget) placeras FÖRST bland prickarna: de är det man ska hitta och står kvar vid sin prick,
    // medan övriga namn viker undan.
    const DH = 18, DGAP = 4, EDGE = 4; // DH = reservhöjd om skylten inte kan mätas; skyltens topp ligger 9 px över prickens mitt (restyleSelection: top -9px)
    const kartBredd = map.getContainer().clientWidth;
    const dotItems: { label: HTMLDivElement; x: number; y: number; w: number; h: number; dx: number; brad: boolean }[] = [];
    dotsRef.current.forEach((d) => {
      if (d.label.style.display === 'none') return;
      const p = map.project(d.marker.getLngLat());
      dotItems.push({ label: d.label, x: p.x, y: p.y, w: d.label.offsetWidth || 90, h: d.label.offsetHeight || DH, dx: Math.round(d.desc.size / 2) + 4, brad: !!d.desc.etikett }); // dx = samma left som restyleSelection ger skylten; w/h = skyltens verkliga mått
    });
    dotItems.sort((a, b) => (a.brad === b.brad ? a.y - b.y : a.brad ? -1 : 1));
    for (const it of dotItems) {
      // Skylten står till höger om pricken. Skulle den gå utanför kartans högerkant står den till vänster i stället — annars klipps
      // datumet av skärmkanten (fit-bounds lägger östligaste trakten exakt vid sidopaddingen, så det händer direkt vid öppning).
      // En brådskande skylt får dessutom pröva vänster sida INNAN den staplas nedåt: en maskin som står på trakten har sin etikett
      // till höger om sig, och datumet ska stå kvar vid sin prick i stället för att hamna bredvid en annan.
      const hoger = it.x + it.dx, vanster = it.x - it.dx - it.w;
      let sidor = [hoger, vanster].filter((l, i) => (i === 0 ? l + it.w <= kartBredd - EDGE : l >= EDGE));
      if (!sidor.length) sidor = [hoger];
      if (!it.brad) sidor = sidor.slice(0, 1); // vanliga namn: som förut (vänster bara när höger går utanför kanten)
      const natTop = it.y - 9;
      const traff = (l: number, t: number) => placed.find((r) => !(l > r.x2 || l + it.w < r.x1 || t > r.y2 || t + it.h < r.y1));
      const friSida = sidor.find((l) => !traff(l, natTop));
      const left = friSida ?? sidor[0]; let top = natTop; let guard = 0;
      if (friSida === undefined) { // ingen sida är fri på prickens höjd → stapla nedåt på förstahandssidan (som maskin-etiketterna)
        for (let hit = traff(left, top); hit && guard++ < 20; hit = traff(left, top)) top = hit.y2 + DGAP;
      }
      it.label.style.transform = left === hoger ? `translateY(${Math.round(top - natTop)}px)` : `translate(${Math.round(left - hoger)}px, ${Math.round(top - natTop)}px)`;
      placed.push({ x1: left, y1: top, x2: left + it.w, y2: top + it.h });
    }
  }, []);

  // Maskin-markörernas synlighet + skärm-klustring. Körs på move/zoom (positionerna ändras i
  // skärmrummet) + vid urval. Vald maskin klustras aldrig och får full etikett. Utan vald maskin:
  // etiketten krymper under z11 (bara namn), och markörer närmare än ~40 px slås ihop till "N".
  const layoutMachines = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    clusterMarkersRef.current.forEach((m) => m.remove()); clusterMarkersRef.current = [];
    const S = selRef.current; const z = map.getZoom();
    // GROT-arket öppet (och ingen maskin vald): skördarna göms helt — bara skotare + GROT-prickar syns. De lämnar också
    // `entries`, så en skotare aldrig slås ihop med en dold skördare till ett "N maskiner"-kluster. Stängs arket kör
    // layoutMachines igen (effekt på grotOppen) och den vanliga vägen nedan visar dem på nytt.
    const goms = grotOppenRef.current && !S;
    type E = { mid: string; mm: { square: HTMLDivElement; label: HTMLDivElement; sub: HTMLDivElement }; f: MaskinForslag; x: number; y: number };
    const entries: E[] = [];
    machMarkersRef.current.forEach((mm, mid) => {
      const f = forslagRef.current.get(mid); if (!f?.koordinat) return;
      mm.container.style.zIndex = grotOppenRef.current ? '2' : ''; // GROT-läget: en maskin ligger ALLTID över de brådskande prickarna (z 1) — en skotare på en trakt döljs aldrig av dess datumprick
      if (goms && f.typ === 'skordare') { mm.square.style.display = 'none'; mm.label.style.display = 'none'; return; }
      const p = map.project([f.koordinat.lng, f.koordinat.lat]); entries.push({ mid, mm, f, x: p.x, y: p.y });
    });
    if (S) { // vald maskin: ingen klustring. Vald → full etikett; övriga → dold etikett (men syns dämpat).
      entries.forEach((e) => { e.mm.square.style.display = 'block'; const sel = e.mid === S; e.mm.label.style.display = sel ? 'flex' : 'none'; e.mm.sub.style.display = 'block'; });
      return;
    }
    const CL = 40; const used = new Set<number>();
    entries.forEach((e, i) => {
      if (used.has(i)) return;
      const group = [e]; used.add(i);
      for (let j = i + 1; j < entries.length; j++) { if (used.has(j)) continue; if (Math.hypot(e.x - entries[j].x, e.y - entries[j].y) < CL) { group.push(entries[j]); used.add(j); } }
      if (group.length === 1) {
        e.mm.square.style.display = 'block'; e.mm.label.style.display = 'flex';
        e.mm.sub.style.display = z >= THRESHOLD_ZOOM ? 'block' : 'none'; // < z11: bara maskinnamnet
        return;
      }
      group.forEach((g) => { g.mm.square.style.display = 'none'; g.mm.label.style.display = 'none'; });
      const cx = group.reduce((s, g) => s + g.x, 0) / group.length, cy = group.reduce((s, g) => s + g.y, 0) / group.length;
      const center = map.unproject([cx, cy]);
      const saknarNasta = group.some((g) => !nastaAv(g.f));
      const el = document.createElement('div'); el.style.cssText = 'position:relative;width:0;height:0;cursor:pointer;z-index:2'; // z 2: över de brådskande GROT-prickarna (z 1), som maskinerna
      const sq = document.createElement('div');
      sq.style.cssText = `position:absolute;left:-16px;top:-16px;width:32px;height:32px;border-radius:7px;background:${FARG.bla};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;box-shadow:0 1px 5px rgba(0,0,0,0.45)`;
      sq.textContent = String(group.length); el.appendChild(sq);
      if (saknarNasta) { const dot = document.createElement('div'); dot.style.cssText = `position:absolute;left:12px;top:-17px;width:9px;height:9px;border-radius:50%;background:${FARG.orange};box-shadow:0 0 0 1.5px #000`; el.appendChild(dot); } // någon i klustret saknar nästa
      el.addEventListener('click', (ev) => { ev.stopPropagation(); map.easeTo({ center: [center.lng, center.lat], zoom: Math.min(16, map.getZoom() + 2.5), duration: 450 }); }); // zooma in → de delar på sig
      clusterMarkersRef.current.push(new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([center.lng, center.lat]).addTo(map));
    });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;
    const map = new window.maplibregl.Map({
      container: mapContainerRef.current, style: buildForarkartaStyle(),
      center: [14.72, 56.50], zoom: 9, maxPitch: 0, dragRotate: false, attributionControl: false,
    });
    mapRef.current = map;
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre */ }
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }));
    map.on('load', () => {
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'routes', type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'clr'], 'line-width': ['get', 'w'], 'line-dasharray': [2, 2], 'line-opacity': ['get', 'op'] } });
      setMapStyleLoaded(true);
    });
    map.on('move', () => { layoutMachines(); layoutLabels(); }); map.on('zoom', () => { layoutMachines(); layoutLabels(); setZoomNiva(map.getZoom()); });
    map.on('click', () => { setSelMaskin(null); setSelObjekt(null); setGrotOppen(false); setGrotValt(null); }); // tryck på kartan stänger alla ark, även GROT
    return () => {
      machMarkersRef.current.forEach((m) => m.marker.remove()); machMarkersRef.current.clear();
      dotsRef.current.forEach((d) => d.marker.remove()); dotsRef.current.clear();
      stopMarkersRef.current.forEach((m) => m.remove()); stopMarkersRef.current = [];
      clusterMarkersRef.current.forEach((m) => m.remove()); clusterMarkersRef.current = [];
      if (highlightMarkerRef.current) { highlightMarkerRef.current.remove(); highlightMarkerRef.current = null; }
      map.remove(); mapRef.current = null; setMapStyleLoaded(false);
    };
  }, [mapReady, layoutLabels, layoutMachines]);

  // Rutt-linjer ritas ENBART för vald maskin (hela kön nu→1→2→…). Översiktsläget har
  // inga linjer alls — fem korsande rutter var brus.
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const src = map.getSource('routes'); if (!src) return;
    const features: any[] = [];
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (f) { // en maskin utan position får ingen sträcka till första objektet (start null → hoppas över nedan), men köobjekten binds ihop
      const koObj = koPreview ?? f.ko.map((p) => p.objekt); // live drag-ordning om aktiv
      const troligtSet = new Set(f.ko.filter((p) => p.troligt).map((p) => p.objekt.id)); // tentativ 2:a (förslag) → dämpad
      const pts: ({ lat: number; lng: number } | null)[] = [ruttStart(f), ...koObj.map((o) => (o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null))];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; if (!a || !b) continue;
        const dimmed = troligtSet.has(koObj[i - 1]?.id); // kö + förslagets 1:a fasta; tentativ 2:a dämpad
        const geom = legGeomCache(a, b);
        if (geom && geom.length > 1) {
          features.push({ type: 'Feature', properties: { clr: LIT_LINE, op: dimmed ? 0.5 : 1, w: dimmed ? 2 : 3 }, geometry: { type: 'LineString', coordinates: geom } }); // väggeometri ur ORS
        } else {
          features.push({ type: 'Feature', properties: { clr: '#8e8e93', op: 0.5, w: 1.5 }, geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] } }); // geometri saknas → tunn rak grå, aldrig påhittad väg
        }
      }
    }
    try { src.setData({ type: 'FeatureCollection', features }); } catch { /* race */ }
  }, [forslag, mapStyleLoaded, selMaskin, koPreview, ruttVersion, legGeomCache]);

  // GROT-trakter utan prick bland objekt-raderna (ingen objekt-rad, eller objekt-raden saknar koordinat men dim_objekt
  // har) ritas bara medan GROT-arket är öppet, så man kan flyga dit. De får syntetiska nycklar 'grot:<dim-id>' i dotsRef.
  const grotUtanPrick = useMemo(() => (grotOppen && grotLista ? grotLista.alla.filter((r) => r.koordinat && (!r.objekt || r.objekt.lat == null || r.objekt.lng == null)) : []), [grotOppen, grotLista]);
  const grotPerObjektId = useMemo(() => new Map<string, GrotRad>((grotLista?.alla ?? []).filter((r) => r.objekt).map((r): [string, GrotRad] => [r.objekt!.id, r])), [grotLista]);
  const oppnaGrotRad = useCallback((dimId: string) => { setSelMaskin(null); setSelObjekt(null); setGrotOppen(true); setGrotValt(dimId); }, []);
  // Prick-klick via ref: DOM-lyssnaren sätts en gång vid skapandet, men beteendet beror på om GROT-arket är öppet.
  const prickKlickRef = useRef<(id: string) => void>(() => {});
  prickKlickRef.current = (id: string) => {
    if (!kanOppnaArkRef.current) return;                                                // förare utan giltig maskin / okänd roll: kartan är bara en karta
    if (id.indexOf('grot:') === 0) { oppnaGrotRad(id.slice(5)); return; }              // GROT-trakt utan objekt-prick
    const grotRad = grotOppen ? grotPerObjektId.get(id) : undefined;
    if (grotRad) { oppnaGrotRad(grotRad.id); return; }                                   // GROT-arket öppet: pricken öppnar GROT-objektet
    if (!selRef.current) setSelObjekt((p) => (p === id ? null : id));                    // som förut
  };

  // Objekt-prickar/ringar
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Map<string, { desc: DotDesc; lat: number; lng: number; namn: string; grot: boolean }>();
    for (const o of objekt) {
      if (o.lat == null || o.lng == null) continue;
      const grotRad = grotOppen ? grotPerObjektId.get(o.id) : undefined;
      const br = grotRad ? bradskandeFor(grotRad, todayISO) : null; // GROT-läget + markägarens datum → brådskande prick (går före statusens stil)
      const d = br ? bradskandePrick(br) : dotDesc(o, koObjektIds.has(o.id), grotIds.has(o.id) ? (grotOppen ? 'oppen' : 'vantar') : false);
      if (d) want.set(o.id, { desc: d, lat: o.lat, lng: o.lng, namn: grotRad?.namn || o.namn, grot: grotPerObjektId.has(o.id) }); // GROT-läge: samma namn som i listan
    }
    grotUtanPrick.forEach((r) => { const br = bradskandeFor(r, todayISO); want.set(`grot:${r.id}`, { desc: br ? bradskandePrick(br) : GROT_PRICK, lat: r.koordinat!.lat, lng: r.koordinat!.lng, namn: r.namn, grot: true }); });
    dotsRef.current.forEach((d, id) => { if (!want.has(id)) { d.marker.remove(); dotsRef.current.delete(id); } });
    want.forEach((p, id) => {
      let entry = dotsRef.current.get(id);
      if (!entry) {
        const el = document.createElement('div'); el.style.cssText = 'position:relative;width:0;height:0;cursor:pointer';
        const circle = document.createElement('div'); circle.style.position = 'absolute';
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;padding:2px 6px;background:${CHIP_BG};border-radius:6px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;box-shadow:0 1px 5px rgba(0,0,0,0.3);display:none`;
        const datum = document.createElement('span'); datum.style.cssText = 'display:none;font-weight:700'; // brådskande: '5 okt' / 'försenad' (text + färg sätts nedan)
        const namn = document.createElement('span');
        label.appendChild(datum); label.appendChild(namn);
        el.appendChild(circle); el.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        el.addEventListener('click', (e) => { e.stopPropagation(); prickKlickRef.current(id); });
        entry = { marker, el, circle, label, datum, namn, desc: p.desc, grot: p.grot };
        dotsRef.current.set(id, entry);
      }
      entry.desc = p.desc; entry.grot = p.grot; entry.namn.textContent = p.namn;
      entry.datum.textContent = p.desc.etikett?.text ?? ''; entry.datum.style.color = p.desc.etikett?.farg ?? '';
    });
    restyleSelection(); // skyltarnas läge läggs om av effekterna nedan (forslag-effekten kör layoutLabels vid varje ändring, och GROT-listan styr forslag via grotIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objekt, koObjektIds, grotIds, grotOppen, grotUtanPrick, grotPerObjektId, mapStyleLoaded, todayISO]);

  // GROT-arket öppnas (chippen) → kartan passar in EN gång över alla synliga skotare + alla GROT-prickar, med botten-padding =
  // arkets verkliga höjd (halvläget, ca 45 %) + luft, så allt syns ovanför arket. Samma regel som maskinval: rör sig aldrig
  // igen förrän användaren zoomar/panorerar eller trycker en rad (raden flyger själv, effekten nedan) — att arket dras till
  // helt läge, eller att en position kommer in efteråt, flyttar inte kameran. Ryms allt redan ovanför arket: ingen rörelse.
  // Nollas när arket stängs, så nästa öppning passar in på nytt. (MapLibres padding består efter fitBounds; det gör den
  // redan efter maskinval och radflygning, och varje inpassning här sätter sin egen padding explicit.)
  const fitGrotOppnaRef = useRef(false);
  useEffect(() => {
    if (!grotOppen) { fitGrotOppnaRef.current = false; return; }
    const map = mapRef.current; if (!map || !mapStyleLoaded || !grotLista || fitGrotOppnaRef.current) return;
    fitGrotOppnaRef.current = true;
    if (grotValt) return; // öppnat rakt på ett objekt → raden flyger själv, ingen översiktsinpassning
    const pts: [number, number][] = [];
    forslag.forEach((f) => { if (f.typ === 'skotare' && f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]); });
    grotLista.alla.forEach((r) => { if (r.koordinat) pts.push([r.koordinat.lng, r.koordinat.lat]); });
    if (!pts.length) return;
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight;
    const ark = C.parentElement?.querySelector('[role="dialog"]') as HTMLElement | null; // listarket är redan monterat i samma commit
    const padT = 80, padSide = 40, padBot = (ark?.offsetHeight ?? Math.round(H * ARK_ANDEL.halv)) + AVSTAND.l; // botten = arkets verkliga höjd + luft
    const padding = { top: padT, bottom: padBot, left: padSide, right: padSide };
    if (pts.every((p) => { const s = map.project(p); return s.x >= padSide && s.x <= W - padSide && s.y >= padT && s.y <= H - padBot; })) return; // ryms redan ovanför arket → rör inte kameran
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 12), padding, duration: 500 });
    else { const b = new window.maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p)); map.fitBounds(b, { padding, maxZoom: 13, duration: 500 }); }
  }, [grotOppen, grotLista, forslag, mapStyleLoaded, grotValt]);

  // Tryck på en GROT-rad → kartan flyger till trakten EN gång (samma regel som vid maskinval: ryms den redan ovanför
  // arket rörs inget; annars centreras den ovanför arket, minst zoom 12). Tillbaka till listan nollar låset, så nästa
  // rad flyger igen. Den valda trakten får en pulserande ring.
  const fitGrotRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    if (!grotValt) { fitGrotRef.current = null; return; }
    if (fitGrotRef.current === grotValt) return;
    const rad = grotLista?.alla.find((r) => r.id === grotValt); if (!rad?.koordinat) return;
    fitGrotRef.current = grotValt;
    const pt: [number, number] = [rad.koordinat.lng, rad.koordinat.lat];
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight;
    const ark = C.parentElement?.querySelector('[role="dialog"]') as HTMLElement | null; // objekt-arket är redan monterat i samma commit
    const padT = 80, padSide = 40, padBot = Math.max(Math.round(H * 0.3), (ark?.offsetHeight ?? Math.round(H * 0.5)) + AVSTAND.l); // botten = arkets verkliga höjd
    const sp = map.project(pt);
    if (sp.x >= padSide && sp.x <= W - padSide && sp.y >= padT && sp.y <= H - padBot - 18) return; // ryms redan ovanför arket (med plats för pulsringen, radie 17) → rör inte kameran
    map.easeTo({ center: pt, zoom: Math.max(map.getZoom(), 12), padding: { top: padT, bottom: padBot, left: padSide, right: padSide }, duration: 500 }); // mitt i området ovanför arket
  }, [grotValt, grotLista, mapStyleLoaded]);
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded || !grotValt) return;
    const rad = grotLista?.alla.find((r) => r.id === grotValt); if (!rad?.koordinat) return;
    const el = document.createElement('div'); el.className = 'puls';
    el.style.cssText = `width:34px;height:34px;border-radius:50%;background:rgba(240,178,76,0.3);border:3px solid ${FARG.diagram2};box-shadow:0 0 0 2px #fff,0 2px 10px rgba(0,0,0,0.45);pointer-events:none`;
    const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([rad.koordinat.lng, rad.koordinat.lat]).addTo(map);
    return () => { try { marker.remove(); } catch { /* kartan är redan borttagen vid unmount */ } };
  }, [grotValt, grotLista, mapStyleLoaded]);

  // Maskin-markörer + etikett (nu → 1:a · km)
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    const want = new Set<string>(); forslag.forEach((f, mid) => { if (f.koordinat) want.add(mid); });
    machMarkersRef.current.forEach((mm, mid) => { if (!want.has(mid)) { mm.marker.remove(); machMarkersRef.current.delete(mid); } });
    forslag.forEach((f, mid) => {
      if (!f.koordinat) return;
      const namn = maskinVisningsnamn(maskiner.find((m) => m.maskin_id === mid)) || mid;
      let entry = machMarkersRef.current.get(mid);
      if (!entry) {
        const container = document.createElement('div'); container.style.cssText = 'position:relative;width:0;height:0';
        const square = document.createElement('div');
        square.style.cssText = `position:absolute;left:-12px;top:-12px;width:24px;height:24px;border-radius:5px;background:${FARG.bla};cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;left:16px;top:-16px;display:flex;flex-direction:row;align-items:baseline;gap:4px;padding:6px 11px;background:${CHIP_BG};border-radius:10px;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        const name = document.createElement('div'); name.style.cssText = `font-size:14px;font-weight:600;color:${FARG.text}`; name.textContent = namn;
        const sub = document.createElement('div'); sub.style.cssText = 'font-size:13px';
        label.appendChild(name); label.appendChild(sub);
        const onClick = (e: Event) => { e.stopPropagation(); if (!kanOppnaArkRef.current) return; setSelObjekt(null); setSelMaskin((prev) => (prev === mid ? null : mid)); }; // ref: lyssnaren sätts en gång, rollen kan komma efteråt
        square.addEventListener('click', onClick); label.addEventListener('click', onClick);
        container.appendChild(square); container.appendChild(label);
        const marker = new window.maplibregl.Marker({ element: container, anchor: 'center' }).setLngLat([f.koordinat.lng, f.koordinat.lat]).addTo(map);
        entry = { marker, container, square, label, sub }; machMarkersRef.current.set(mid, entry);
      } else { (entry.label.firstChild as HTMLDivElement).textContent = namn; entry.marker.setLngLat([f.koordinat.lng, f.koordinat.lat]); }
      entry.sub.textContent = sublabelText(f); // bara "→ nästa" / "· inget planerat"; km finns i arket
      entry.sub.style.color = nastaAv(f) ? '#a1a1a6' : FARG.text2;
    });
    restyleSelection(); layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forslag, maskiner, mapStyleLoaded, sublabelText, layoutLabels]);

  // Auto-fit en gång (flott-översikt). Hoppas över om en maskin redan är vald → urvals-fit äger kameran (förarläge).
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded || didFitRef.current) return;
    if (djupLankRef.current.id && !djupLankRef.current.klar) return; // djuplänk väntar → den äger kameran (hanteras i effekten nedan)
    if (selRef.current) { didFitRef.current = true; return; }
    const pts: [number, number][] = [];
    forslag.forEach((f) => { if (f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]); const n = nastaAv(f); if (n && n.lat != null && n.lng != null) pts.push([n.lng, n.lat]); });
    if (!pts.length) return; didFitRef.current = true;
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: 12, duration: 500 });
    else { const b = new window.maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p)); map.fitBounds(b, { padding: { top: 60, left: 40, right: 40, bottom: 140 }, maxZoom: 13, duration: 500 }); }
  }, [forslag, mapStyleLoaded, djupLankKlar]);

  // Djuplänk → centrera + öppna objekt-arket. Körs en gång, när kartan och objekten är redo. Okänt objekt eller
  // objekt utan koordinat → länken släpps och vanliga översikten (auto-inpassning) tar över.
  useEffect(() => {
    const dl = djupLankRef.current; const map = mapRef.current;
    if (!dl.id || dl.klar || !map || !mapStyleLoaded || laddar || rollLaddar) return; // väntar in rollen: ett ark får inte öppnas åt någon som saknar rätt till det
    dl.klar = true;
    if (!kanOppnaArk) { setDjupLankKlar(true); return; } // förare utan giltig maskin / okänd roll: länken öppnar inget ark — kartan får sin vanliga inpassning
    const o = objekt.find((x) => x.id === dl.id);
    if (!o || o.lat == null || o.lng == null) { setDjupLankKlar(true); return; }
    didFitRef.current = true; // klart — ingen flott-inpassning över det här
    const H = map.getContainer().clientHeight;
    map.easeTo({ center: [o.lng, o.lat], zoom: 14, offset: [0, -Math.round(H * 0.18)], duration: 500 }); // förskjuten uppåt: prickens plats ligger ovanför arket
    setSelObjekt(o.id);
  }, [objekt, mapStyleLoaded, laddar, rollLaddar, kanOppnaArk]);

  // Zoom-/urvals-styrd synlighet. Prick: visas om inzoomad ELLER utzoom-flagga. Namn-etikett:
  // bara utan vald maskin (då sköter rutt-chips namnen), bara namnbara (ej avslutade), bara ≥ tröskel.
  const syncDotVisibility = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const z = map.getZoom(); const S = selRef.current;
    const grot = grotOppenRef.current; // GROT-arket öppet: övriga prickar är dämpade (restyleSelection) och får ingen namn-etikett som kan skjuta undan en GROT-etikett
    dotsRef.current.forEach((d) => {
      const dotVisible = z >= THRESHOLD_ZOOM || d.desc.utzoom;
      d.el.style.display = dotVisible ? 'block' : 'none';
      const namnSyns = dotVisible && !S && d.desc.namnbar && z >= THRESHOLD_ZOOM && !(grot && !d.grot);
      const datumSyns = dotVisible && grot && !!d.desc.etikett; // brådskande datumskylt: ALLA zoomnivåer — prickar slås aldrig ihop till kluster, så skylten är aldrig borta
      d.namn.style.display = namnSyns ? 'inline' : 'none';
      d.datum.style.display = datumSyns ? 'inline' : 'none';
      d.datum.style.marginRight = namnSyns ? '6px' : '0'; // luft mellan datum och namn; skylten med bara datum får ingen tom kant
      d.label.style.display = (namnSyns || datumSyns) ? 'block' : 'none';
    });
  }, []);
  useEffect(() => { syncDotVisibility(); layoutLabels(); }, [zoomNiva, syncDotVisibility, layoutLabels]);

  const restyleSelection = useCallback(() => {
    const map = mapRef.current; if (!map) return;
    const S = selRef.current;
    const koObj = valdKoObjekt(S); // live preview under drag, annars ur forslag
    const forslagKo = S ? (forslagRef.current.get(S)?.ko ?? []) : [];
    const troligtSet = new Set(forslagKo.filter((p) => p.troligt).map((p) => p.objekt.id)); // tentativ 2:a dämpas, även under drag
    const koIds = new Set<string>(koObj.map((o) => o.id));

    machMarkersRef.current.forEach((mm, mid) => {
      const sel = mid === S;
      mm.square.style.width = sel ? '28px' : '24px'; mm.square.style.height = sel ? '28px' : '24px';
      mm.square.style.left = sel ? '-14px' : '-12px'; mm.square.style.top = sel ? '-14px' : '-12px';
      mm.square.style.opacity = (!S || sel) ? '1' : '0.28';
      mm.square.style.boxShadow = sel ? `0 0 0 4px rgba(10,132,255,0.28), 0 1px 4px rgba(0,0,0,0.4)` : '0 1px 4px rgba(0,0,0,0.4)';
    }); // etikett-/klustersynlighet ägs av layoutMachines (anropas sist)
    dotsRef.current.forEach((d, id) => {
      const desc = d.desc;
      // Dämpad = en maskin är vald och pricken ligger inte i dess kö, ELLER GROT-arket är öppet och pricken inte hör till GROT-listan.
      const dampad = (S && !koIds.has(id)) || (grotOppenRef.current && !d.grot);
      const op = dampad ? 0.1 : desc.opacity;
      const px = desc.size;
      const base = `position:absolute;box-sizing:border-box;left:${-px / 2}px;top:${-px / 2}px;width:${px}px;height:${px}px;border-radius:50%;`;
      // Halo = 1,5 px vit ytterkant + mjuk skugga så prickarna lyfter från ljus topografi. Avslutade orörda.
      const halo = desc.halo ? `0 0 0 1.5px rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.35)` : `0 0 0 1px rgba(0,0,0,0.25)`;
      if (desc.form === 'ring') d.circle.style.cssText = base + `background:transparent;border:3px solid ${LIT_LINE};opacity:${op};box-shadow:${halo}`; // ihålig ring: 18 px, 3 px mörk kontur, vit halo
      else d.circle.style.cssText = base + `background:${desc.color};opacity:${op};box-shadow:${halo}`;
      if (desc.etikett) d.circle.style.boxShadow = '0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,0.45)'; // brådskande GROT-prick: kraftigare vit halo (2 px)
      d.label.style.left = `${Math.round(px / 2) + 4}px`; d.label.style.top = '-9px'; d.label.style.opacity = String(op);
      d.el.style.zIndex = desc.etikett ? '1' : ''; // brådskande prick + skylt över övriga prickar (annars skymmer senare prickar datumet)
      d.label.style.pointerEvents = desc.etikett ? 'auto' : 'none'; d.label.style.cursor = desc.etikett ? 'pointer' : ''; // datumskylten är en del av pricken: tryck öppnar raden (annars träffar trycket kartan och stänger arket)
    });
    syncDotVisibility();
    if (map.getLayer('routes')) map.getSource('routes'); // paint är data-driven (uppdateras i rutt-effekten)

    stopMarkersRef.current.forEach((m) => m.remove()); stopMarkersRef.current = [];
    if (S) {
      const f = forslagRef.current.get(S);
      koObj.forEach((o, i) => {
        if (o.lat == null || o.lng == null) return;
        const troligt = troligtSet.has(o.id);
        const circ = document.createElement('div');
        circ.style.cssText = `width:26px;height:26px;border-radius:50%;background:${FARG.gron};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;opacity:${troligt ? 0.6 : 1};pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        circ.textContent = String(i + 1);
        stopMarkersRef.current.push(new window.maplibregl.Marker({ element: circ, anchor: 'center' }).setLngLat([o.lng, o.lat]).addTo(map));
        const nameChip = document.createElement('div');
        nameChip.style.cssText = `padding:3px 8px;background:${CHIP_BG};border-radius:8px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;opacity:${troligt ? 0.8 : 1};box-shadow:0 2px 8px rgba(0,0,0,0.35)`;
        nameChip.textContent = koNamn(o); // GROT-trakter märks
        stopMarkersRef.current.push(new window.maplibregl.Marker({ element: nameChip, anchor: 'bottom', offset: [0, -18] }).setLngLat([o.lng, o.lat]).addTo(map));
        // km ur klient-cachen (route-cache); miss → '–' (inga routing-anrop mitt i ett drag)
        const prev = i === 0 ? (f ? ruttStart(f) : null) : (koObj[i - 1].lat != null ? { lat: koObj[i - 1].lat!, lng: koObj[i - 1].lng! } : null);
        const to = { lat: o.lat, lng: o.lng };
        if (prev) {
          const km = legKmCache(prev, to); const geom = legGeomCache(prev, to); const kmChip = document.createElement('div');
          kmChip.style.cssText = `padding:2px 7px;background:${CHIP_BG};border-radius:8px;font-size:12px;font-weight:600;color:${FARG.text};white-space:nowrap;pointer-events:none;opacity:${troligt ? 0.8 : 1}`;
          kmChip.textContent = km != null ? `${Math.round(km)} km` : '–';
          const mid = geom && geom.length > 1 ? geom[Math.floor(geom.length / 2)] : [(prev.lng + o.lng) / 2, (prev.lat + o.lat) / 2]; // på vägen om geometri finns
          stopMarkersRef.current.push(new window.maplibregl.Marker({ element: kmChip, anchor: 'center' }).setLngLat(mid as [number, number]).addTo(map));
        }
      });
    }
    layoutMachines(); // klustring + etikettsynlighet speglar urvalet
  }, []);

  // grotOppen: öppnas/stängs GROT-arket ska skördarna gömmas/visas och prickarna dämpas/återställas direkt (restyleSelection
  // kör layoutMachines + prickarnas stil). Stängs arket kommer allt tillbaka.
  useEffect(() => {
    restyleSelection(); layoutLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMaskin, ruttVersion, forslag, restyleSelection, layoutLabels, grotOppen]);

  // Tryck på maskin → passa in maskin + alla kö-objekt EN gång (padding så allt ligger ovanför arket).
  // Rör sig aldrig igen förrän användaren zoomar/panorerar eller väljer annan maskin. Ryms allt redan: ingen rörelse.
  const fitSelRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    if (!selMaskin) { fitSelRef.current = null; return; }
    if (fitSelRef.current === selMaskin || ordnaRef.current) return; // redan inpassad, el. redigering äger kameran
    const f = forslag.get(selMaskin); if (!f) return;
    const pts: [number, number][] = [];
    if (f.koordinat) pts.push([f.koordinat.lng, f.koordinat.lat]); // markören (stammen)
    f.ko.forEach((p) => { if (p.objekt.lat != null && p.objekt.lng != null) pts.push([p.objekt.lng, p.objekt.lat]); });
    if (!pts.length) return;
    fitSelRef.current = selMaskin;
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight;
    const padT = 80, padSide = 40, padBot = Math.round(H * 0.42); // botten = arkets höjd (route ovanför)
    const inside = pts.every((p) => { const s = map.project(p); return s.x >= padSide && s.x <= W - padSide && s.y >= padT && s.y <= H - padBot; });
    if (inside) return; // ryms redan ovanför arket → rör inte kameran
    if (pts.length === 1) map.easeTo({ center: pts[0], zoom: Math.max(map.getZoom(), 12), duration: 500 });
    else { const b = new window.maplibregl.LngLatBounds(); pts.forEach((p) => b.extend(p)); map.fitBounds(b, { padding: { top: padT, left: padSide, right: padSide, bottom: padBot }, maxZoom: 14, duration: 500 }); }
  }, [selMaskin, forslag, mapStyleLoaded]);

  // ── kö-skrivningar (v2:s egna; rör aldrig OversiktMaskiner) ──
  // VERIFIERADE (ko-skriv.ts): kön läses färskt, skrivs, och läses tillbaka — det som avgör är vad som ligger i databasen, inte
  // om anropet svarade. Svaret är null när det landade, annars ett meddelande som arket visar ("Kunde inte spara — försök
  // igen"); tekniken går till konsolen. Kön på skärmen byts ALLTID mot det som faktiskt ligger i databasen — lyckat eller inte —
  // och kan inte kön läsas lämnas skärmen orörd. En skrivning i taget (koKor): två tryck i rad läser aldrig samma kö.
  const koKor = useRef(skapaKoKedja()).current;
  const koSkriv = useCallback(async (op: () => Promise<KoSvar>): Promise<string | null> => {
    try {
      const r = await koKor(op);
      if (r.ko) setMaskinKo(r.ko);
      return r.ok ? null : r.meddelande;
    } catch (e) {
      console.error('[Översikt v2] köskrivningen kastade', e);
      const ko = await lasKo(supabase);
      if (ko) setMaskinKo(ko);
      return ko ? KO_SPARFEL : KO_LASFEL;
    }
  }, [koKor]);
  const laggIKo = useCallback((maskinId: string, objektId: string) => koSkriv(() => laggIKoVerifierat(supabase, maskinId, objektId)), [koSkriv]);
  const flyttaKo = useCallback((koId: string, tillMaskin: string) => koSkriv(() => flyttaKoVerifierat(supabase, koId, tillMaskin)), [koSkriv]);
  const taBortKo = useCallback((koId: string) => koSkriv(() => taBortKoVerifierat(supabase, koId)), [koSkriv]);
  // Varje släpp sparar: skriv om ordning (0..n). De synliga i ny ordning först, dolda
  // (avslutade/nu) läggs efter så gamla vyns kö inte tappar rader. Ingen Spara-knapp.
  const skrivOrdning = useCallback(async (maskinId: string, orderedVisibleKoIds: string[]) => {
    const fel = await koSkriv(() => skrivOrdningVerifierat(supabase, maskinId, orderedVisibleKoIds));
    if (fel) setKoPreview(null); // kartans förhandsvisning tillbaka till kön som ligger i databasen (dra-listan ritas om i arket)
    return fel;
  }, [koSkriv]);

  // Live-preview under drag: koId-ordning → objekt → koPreview (kartan ritar om direkt, ingen skrivning).
  const hanteraOrderChange = useCallback((koIds: string[]) => {
    const koObjs = koIds.map((koId) => { const k = maskinKo.find((x) => x.id === koId); return k ? objekt.find((o) => o.id === k.objekt_id) ?? null : null; }).filter((o): o is OversiktObjekt => !!o);
    const S = selRef.current; // behåll förslagen efter kön på kartans rutt under drag
    const forslagObjs = S ? (forslagRef.current.get(S)?.ko ?? []).filter((p) => p.kalla === 'forslag').map((p) => p.objekt) : [];
    setKoPreview([...koObjs, ...forslagObjs]);
  }, [maskinKo, objekt]);
  // Redigeringsläge på/av: sätt preview, förhämta par-ben till km-cachen, krymp arket-fit på kartan.
  const hanteraOrdnaLage = useCallback((active: boolean) => {
    const map = mapRef.current;
    const f = selMaskin ? forslag.get(selMaskin) : null;
    if (!active || !f) { ordnaRef.current = false; setKoPreview(null); return; }
    ordnaRef.current = true; // hädanefter rör kartan sig inte av sig själv förrän Klar
    const koObj = f.ko.map((p) => p.objekt);
    setKoPreview(koObj);
    const start = ruttStart(f); // null för en maskin utan position — då är det bara köobjekten som ritas och förhämtas
    const punkter = [...(start ? [start] : []), ...koObj.filter((o) => o.lat != null && o.lng != null).map((o) => ({ lat: o.lat!, lng: o.lng! }))];
    // Förhämta ALLA par-ben (väggeometri + km) så en ny drag-ordning kan rita riktig vägrutt direkt;
    // det som inte hunnit cachas ritas som rak grå tills släpp. Inga anrop sker sedan mitt i draget.
    (async () => { for (let i = 0; i < punkter.length; i++) for (let j = 0; j < punkter.length; j++) if (i !== j) await vagRuttCached(punkter[i], punkter[j]); setRuttVersion((v) => v + 1); })();
    if (map && punkter.length) {
      const b = new window.maplibregl.LngLatBounds(); punkter.forEach((p) => b.extend([p.lng, p.lat]));
      const h = mapContainerRef.current?.offsetHeight ?? 600;
      map.fitBounds(b, { padding: { top: 80, left: 50, right: 50, bottom: Math.round(h * 0.45) + 48 }, maxZoom: 14, duration: 500 });
    }
  }, [selMaskin, forslag, vagRuttCached]);
  useEffect(() => { ordnaRef.current = false; setKoPreview(null); setHighlightObjekt(null); }, [selMaskin]); // byte/stängning av maskin nollar preview + redigeringslås
  useEffect(() => { restyleSelection(); }, [koPreview, restyleSelection]); // rita om numren live

  // Highlight-prick för picker-raden under fingret. Panorerar in objektet BARA om det är dolt (bakom arket/utanför vyn).
  useEffect(() => {
    const map = mapRef.current; if (!map || !mapStyleLoaded) return;
    if (highlightMarkerRef.current) { highlightMarkerRef.current.remove(); highlightMarkerRef.current = null; }
    if (!highlightObjekt) return;
    const o = objekt.find((x) => x.id === highlightObjekt); if (!o || o.lat == null || o.lng == null) return;
    const el = document.createElement('div'); el.className = 'puls';
    el.style.cssText = `width:30px;height:30px;border-radius:50%;background:rgba(10,132,255,0.3);border:3px solid ${FARG.bla};box-shadow:0 0 0 2px #fff,0 2px 10px rgba(0,0,0,0.45);pointer-events:none`;
    highlightMarkerRef.current = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([o.lng, o.lat]).addTo(map);
    const C = map.getContainer(); const W = C.clientWidth, H = C.clientHeight; const s = map.project([o.lng, o.lat]);
    const doltBakomArk = s.x < 30 || s.x > W - 30 || s.y < 60 || s.y > H * 0.5; // synlig map-yta = ovanför ~halva skärmen (arket täcker nedre)
    if (doltBakomArk) map.easeTo({ center: [o.lng, o.lat], offset: [0, -Math.round(H * 0.22)], duration: 300 });
  }, [highlightObjekt, objekt, mapStyleLoaded]);

  // härlett
  // Maskiner utan position: ALLA aktiva, inte bara de som har en kö — en skotare som aldrig skickar filer (810E) ska gå att öppna och
  // lägga i kö för även när kön är tom. Listan görs först när positionerna är lästa, annars blinkar hela flottan som "ingen position".
  const utanPosition = useMemo(() => (platserKlar ? maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && !positions.get(m.maskin_id)?.koordinat) : []), [platserKlar, maskiner, positions, todayISO]);
  const utanKoord = useMemo(() => objekt.filter((o) => (o.status === 'planerad' || STATUS_AKTIV.includes(o.status)) && (o.lat == null || o.lng == null)).length, [objekt]);
  const valt = selMaskin ? forslag.get(selMaskin) ?? null : null;
  const objektValt = selObjekt ? objekt.find((o) => o.id === selObjekt) ?? null : null;
  // Maskiner som objekt-arket kan lägga ett objekt i kö för: alla aktiva — inte bara de med position eller kö (810E måste gå att köa).
  const kobaraSkordare = useMemo(() => maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && !arSkotare(m as MaskinRad)), [maskiner, todayISO]);
  const kobaraSkotare = useMemo(() => maskiner.filter((m) => maskinAktiv(m as MaskinRad, todayISO) && arSkotare(m as MaskinRad)), [maskiner, todayISO]);
  const maskinById = useMemo(() => new Map(maskiner.map((m) => [m.maskin_id, m] as const)), [maskiner]);
  const maskinRollAv = useCallback((id: string): MaskinTyp | null => { const mm = maskinById.get(id); return mm ? (arSkotare(mm as MaskinRad) ? 'skotare' : 'skordare') : null; }, [maskinById]);
  const maskinNamnAv = useCallback((id: string): string => maskinVisningsnamn(maskinById.get(id)) || id, [maskinById]);

  // '+ Lägg till objekt'-väljaren: kandidater för vald maskin (highlightObjekt-state deklareras ovan).
  const laggKandidater = useMemo<LaggKand[]>(() => {
    if (!valt || !selMaskin) return [];
    const m = maskiner.find((x) => x.maskin_id === selMaskin);
    const skotare = arSkotare(m as MaskinRad);
    const klarT = (m as any)?.klarar_typ ?? null; const roll = (m as any)?.skotar_roll ?? null;
    const start = laggStart(valt); const nuId = valt.nuObjekt?.id ?? null;
    const rows: LaggKand[] = [];
    for (const o of objekt) {
      if (o.lat == null || o.lng == null || o.id === nuId || STATUS_AVSLUTADE.includes(o.status)) continue;
      let m3: number | null = null;
      if (skotare) {
        if (!rollMatcharTyp(roll, o.typ)) continue;
        const agg = o.vo_nummer ? skord[o.vo_nummer] : undefined;
        const backen = agg && agg.skordat > 0 ? paBackenKvar(agg.skordat, agg.skotat, agg.egenSkotning) : 0;
        if (!backen || backen <= 0) continue; // bara objekt med virke på backen
        m3 = backen;
      } else {
        if (o.status !== 'planerad' || !klararObjekt(klarT, o.typ)) continue; // planerade som klarar_typ
        m3 = o.volym_planerad ?? (o.volym || null);
      }
      // Kö över roller: bara en maskin av SAMMA roll spärrar. En skördares objekt kan läggas i en skotares kö och tvärtom — då visas
      // "i kö för X" som info, raden går att välja.
      const kl = koLaget({ objektId: o.id, maskinId: selMaskin, roll: skotare ? 'skotare' : 'skordare', ko: maskinKo, rollAv: maskinRollAv, namnAv: maskinNamnAv });
      rows.push({ id: o.id, namn: o.namn, atgard: o.atgard || (o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning'), m3, lat: o.lat, lng: o.lng, koMaskinNamn: kl.spar.length ? kl.spar.join(', ') : null, koInfo: kl.info.length ? kl.info.join(', ') : null });
    }
    const avst = (r: LaggKand) => start ? (legKmCache(start, { lat: r.lat, lng: r.lng }) ?? haversineKm(start, { lat: r.lat, lng: r.lng })) : Infinity; // väg om cachat, annars fågelväg
    return [...rows].sort((a, b) => avst(a) - avst(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valt, selMaskin, maskiner, objekt, skord, maskinKo, ruttVersion, maskinRollAv, maskinNamnAv]);
  const laggKmTill = useCallback((k: LaggKand): number | null => { const f = selMaskin ? forslag.get(selMaskin) : null; const start = f ? laggStart(f) : null; return start ? legKmCache(start, { lat: k.lat, lng: k.lng }) : null; }, [selMaskin, forslag, legKmCache]);
  const hanteraLaggLage = useCallback((active: boolean) => {
    if (!active) { setHighlightObjekt(null); return; }
    const f = selMaskin ? forslag.get(selMaskin) : null; const start = f ? laggStart(f) : null; if (!start) return;
    const mal = laggKandidater.slice(0, 40).map((k) => ({ lat: k.lat, lng: k.lng })); // förhämta vägavstånd (väg-km + omsortering)
    (async () => { let n = 0; for (const t of mal) { await vagRuttCached(start, t); if (++n % 8 === 0) setRuttVersion((v) => v + 1); } setRuttVersion((v) => v + 1); })(); // bumpa i klump, inte per anrop
  }, [selMaskin, forslag, laggKandidater, vagRuttCached]);
  const valjLaggObjekt = useCallback((objektId: string): Promise<string | null> => { setHighlightObjekt(null); return selMaskin ? laggIKo(selMaskin, objektId) : Promise.resolve(null); }, [selMaskin, laggIKo]);
  // Arkets km per ben (vald maskins fasta kö) ur rutt-cachen; miss → null ("–"). ruttVersion → uppdateras när ORS svarat.
  const selLegs = useMemo(() => {
    if (!valt) return [] as (number | null)[]; // en maskin utan position: första sträckan har ingen start (null → '–'), resten räknas
    const pts: ({ lat: number; lng: number } | null)[] = [ruttStart(valt), ...valt.ko.map((p) => (p.objekt.lat != null && p.objekt.lng != null ? { lat: p.objekt.lat, lng: p.objekt.lng } : null))];
    const out: (number | null)[] = [];
    for (let i = 1; i < pts.length; i++) out.push(legKmCache(pts[i - 1], pts[i]));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valt, ruttVersion, legKmCache]);

  // ── GROT-arket (chip → lista → objekt) ──
  const grotAvst = useGrotVagAvstand(grotLista, grotOppen); // vägavstånd mellan GROT-objekten hämtas först när arket öppnas
  const grotListRullRef = useRef(0); // listans rullningsläge — tillbaka-pilen från ett objekt landar där man var
  const grotListLageRef = useRef<ArkLage>('halv'); // listarkets läge (halv/full) — chippen öppnar alltid i halvläge, tillbaka-pilen återvänder till det man lämnade
  const grotRadPer = useMemo(() => new Map<string, GrotRad>((grotLista?.alla ?? []).map((r): [string, GrotRad] => [r.id, r])), [grotLista]);
  const grotNamnFor = useCallback((maskinId: string) => grotSkotare.find((s) => s.id === maskinId)?.namn
    || maskinVisningsnamn(maskiner.find((m) => m.maskin_id === maskinId)) || maskinId, [grotSkotare, maskiner]);
  const grotHogerText = (rad: GrotRad): string => {
    if (rad.staarHar) return `${grotNamnFor(rad.staarHar.maskinId)} står här`;
    const n = narmasteVag(rad.id, grotAvst.kandidater, grotAvst.km);
    return n ? avstandText(n.km, grotRadPer.get(n.annanId)?.namn) : '–';
  };
  const valtGrotRad = grotValt ? grotRadPer.get(grotValt) ?? null : null;
  const objektStatusPer = useMemo(() => new Map<string, string>(objekt.map((o): [string, string] => [o.id, o.status])), [objekt]);
  const koForGrotValt: ArkKo | null = useMemo(() => {
    const objektId = valtGrotRad?.objekt?.id;
    // "I kö" = i en SKOTARES kö. En gammal rad i en skördares kö är en kvarleva (v2 döljer den) och räknas inte.
    const post = objektId ? maskinKo.find((k) => k.objekt_id === objektId && grotSkotare.some((s) => s.id === k.maskin_id)) : undefined;
    if (!post) return null;
    // Platsen räknas bland raderna som SYNS i kön (avslutade göms, utom GROT-väntande) — annars blir "3:a" fel när en gammal rad ligger dold före.
    const syns = (k: MaskinKoItem) => { const st = objektStatusPer.get(k.objekt_id); return st != null && (!STATUS_AVSLUTADE.includes(st) || grotIds.has(k.objekt_id)); };
    const egna = maskinKo.filter((k) => k.maskin_id === post.maskin_id && syns(k)).sort((a, b) => a.ordning - b.ordning || (a.id < b.id ? -1 : 1));
    return { post, maskinNamn: grotNamnFor(post.maskin_id), plats: egna.findIndex((k) => k.id === post.id) + 1 };
  }, [valtGrotRad, maskinKo, grotSkotare, grotNamnFor, objektStatusPer, grotIds]);
  const oppnaGrot = () => { setSelMaskin(null); setSelObjekt(null); setGrotValt(null); grotListLageRef.current = 'halv'; setGrotOppen(true); };
  const stangGrot = useCallback(() => { setGrotOppen(false); setGrotValt(null); }, []);
  const tillbakaTillGrotLista = useCallback(() => setGrotValt(null), []);

  // GROT-köskrivningar: verifierade — kön läses tillbaka och raden ska finnas (eller vara borta), annars får användaren veta.
  const grotLasKo = useCallback(async (): Promise<MaskinKoItem[] | null> => {
    const { data, error } = await supabase.from('maskin_ko').select('id, maskin_id, objekt_id, ordning, created_at').order('ordning').order('id');
    return error ? null : ((data || []) as MaskinKoItem[]);
  }, []);
  const grotLaggIKo = useCallback(async (maskinId: string, objektId: string): Promise<string | null> => {
    const nu = await grotLasKo();
    if (!nu) return 'Kunde inte läsa kön. Försök igen.';
    if (!nu.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId)) {
      const maxOrd = nu.filter((k) => k.maskin_id === maskinId).reduce((m, k) => Math.max(m, k.ordning), -1);
      const { error } = await supabase.from('maskin_ko').insert({ maskin_id: maskinId, objekt_id: objektId, ordning: maxOrd + 1 });
      if (error) return 'Kunde inte lägga i kön. Försök igen.';
    }
    const efter = await grotLasKo(); // insert utan fel bevisar inte att raden finns — läs tillbaka INNEHÅLLET
    if (!efter) return 'Kunde inte läsa kön efteråt. Ladda om sidan.';
    setMaskinKo(efter);
    return efter.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId) ? null : 'Ändringen landade inte. Försök igen.';
  }, [grotLasKo]);
  const grotTaBortKo = useCallback(async (koId: string): Promise<string | null> => {
    const { error } = await supabase.from('maskin_ko').delete().eq('id', koId);
    if (error) return 'Kunde inte ta bort ur kön. Försök igen.';
    const efter = await grotLasKo();
    if (!efter) return 'Kunde inte läsa kön efteråt. Ladda om sidan.';
    setMaskinKo(efter);
    return efter.some((k) => k.id === koId) ? 'Ändringen landade inte. Försök igen.' : null;
  }, [grotLasKo]);

  // Markägarens datum (bortkört senast): direktspar, VERIFIERAT — sparaFalt läser tillbaka värdet på varje rad
  // och svarar ok först när det som står i databasen är det som skickades. Skrivs över hela VO-gruppen (samma regel som
  // redigeringsvyn); syskonen slås upp färskt, för grotRaw har bara de GROT-anpassade raderna. Landar det speglas patchen i
  // råraderna, så listan, chippen och arket räknar om utan ny hämtning. Returnerar null när det landade, annars ett fel.
  const grotSpara = useCallback(async (rad: GrotRad, patch: GrotSkrivning): Promise<string | null> => {
    const vo = (rad.voNummer ?? '').trim();
    let dimIds = [rad.id];
    if (vo) {
      const { data, error } = await supabase.from('dim_objekt').select('objekt_id').eq('vo_nummer', vo).order('objekt_id');
      if (error) { console.error('[Översikt v2] kunde inte läsa objektets VO-grupp', error.message); return 'Kunde inte spara. Försök igen.'; }
      const funna = ((data || []) as { objekt_id: string }[]).map((r) => r.objekt_id);
      if (funna.indexOf(rad.id) < 0) return 'Objektet finns inte längre. Ladda om sidan.';
      dimIds = funna;
    }
    const res = await sparaFalt({ dimObjektIds: dimIds, voNummer: vo || null }, patch);
    if (!res.ok) { console.error('[Översikt v2] GROT-sparningen landade inte', res.message); return 'Kunde inte spara. Försök igen.'; }
    setGrotRaw((prev) => (prev ? medDimPatch(prev, dimIds, patch) : prev));
    return null;
  }, []);

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - 56px - env(safe-area-inset-top))', width: '100%', background: FARG.bg, color: FARG.text, fontFamily: FONT, overflow: 'hidden', WebkitFontSmoothing: 'antialiased' }}>
      <style>{designCss}</style>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* GROT-chip — bara förman/admin (förare och okänd roll ser den aldrig) och bara när något väntar. Tryck → GROT-listan som ark.
          'GROT · 28 · 2 snart': orange när något har markägarens datum inom 7 dagar (eller förbi) och inte är kört — orden bär
          beskedet, färgen förstärker det. */}
      {!laddar && !fel && kanRedigera && grotLista && grotLista.alla.length > 0 && (
        <button onClick={() => (grotOppen ? stangGrot() : oppnaGrot())} aria-pressed={grotOppen} aria-label={`GROT-listan, ${grotLista.alla.length} objekt${grotSnart > 0 ? `, ${grotSnart} snart` : ''}`}
          style={{ position: 'absolute', top: AVSTAND.m, right: AVSTAND.m, zIndex: 7, minHeight: 44, padding: `0 ${AVSTAND.m}px`, display: 'flex', alignItems: 'center', border: 'none', borderRadius: RADIE.knapp, cursor: 'pointer', fontFamily: 'inherit', background: CHIP_BG, color: grotSnart > 0 ? FARG.orange : FARG.text, boxShadow: '0 2px 8px rgba(0,0,0,0.35)', ...TYP.meta, fontWeight: 600, ...TNUM }}>
          {grotChipText(grotLista.alla.length, grotSnart)}
        </button>
      )}

      {laddar && (
        <div style={{ position: 'absolute', inset: 0, background: FARG.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.m, zIndex: 10 }}>
          <div className="puls" style={{ ...TYP.rubrik, color: FARG.text2 }}>Laddar kartan…</div>
          <div style={{ ...TYP.meta, color: FARG.text3 }}>Hämtar maskiner och objekt</div>
        </div>
      )}
      {fel && (
        <div style={{ position: 'absolute', inset: 0, background: FARG.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.l, padding: `0 ${AVSTAND.xxl}px`, textAlign: 'center', zIndex: 10 }}>
          <div style={{ ...TYP.rubrik }}>Kunde inte läsa</div>
          <div style={{ ...TYP.meta, color: FARG.text2, maxWidth: 260, lineHeight: 1.5 }}>Kontrollera uppkopplingen och försök igen.</div>
          <button onClick={() => fetchAll()} style={{ minHeight: 48, padding: `0 ${AVSTAND.xl}px`, borderRadius: RADIE.knapp, border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.listtitel, color: FARG.bg, background: FARG.text }}>Försök igen</button>
        </div>
      )}

      {/* Maskiner utan plats + N objekt utan plats — samma strip (översiktsläge). Maskinraderna går att trycka på: de öppnar
          maskin-arket (kö, Ändra ordning, + Lägg till objekt) som för en maskin på kartan. Utan rätt till ark (förare utan giltig
          maskin, okänd roll) är raderna bara text. */}
      {!laddar && !fel && !selMaskin && !objektValt && !grotOppen && (utanPosition.length > 0 || utanKoord > 0) && (
        <div style={{ position: 'absolute', left: AVSTAND.l, right: AVSTAND.l, bottom: `calc(${AVSTAND.l}px + env(safe-area-inset-bottom))`, background: CHIP_BG, borderRadius: RADIE.kort, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', zIndex: 6 }}>
          <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Utanför kartan</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {utanPosition.map((m) => {
              const namn = maskinVisningsnamn(m) || m.maskin_id;
              const text = <>{namn} <span style={{ color: FARG.text2 }}>— ingen position</span></>;
              return kanOppnaArk ? (
                <button key={m.maskin_id} onClick={() => { setSelObjekt(null); setSelMaskin(m.maskin_id); }} aria-label={`Öppna ${namn}, ingen position`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%', minHeight: 44, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ...TYP.meta, color: FARG.text }}>
                  <span>{text}</span><span aria-hidden="true" style={{ color: FARG.text2 }}>›</span>
                </button>
              ) : (
                <div key={m.maskin_id} style={{ ...TYP.meta, color: FARG.text }}>{text}</div>
              );
            })}
            {utanKoord > 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>{utanKoord} objekt utan plats — syns inte på kartan</div>}
          </div>
        </div>
      )}

      {/* MASKIN-ARK — förman: kö-knappar. Förare: läsläge (inga skrivknappar) på ALLA maskiner; den egna märks "din maskin".
          Förare utan giltig maskin och okänd roll får inget ark. Raderna Nu/1/2… öppnar objekt-arket (med pil tillbaka hit). */}
      {!laddar && !fel && kanOppnaArk && valt && !objektValt && (
        <MaskinArk key={selMaskin!} f={valt} namn={maskinNamnAv(selMaskin!)}
          legs={selLegs} skord={skord} warnings={warnings}
          telefon={kanRedigera ? (telByMaskin[selMaskin!] ?? null) : null}
          forare={!kanRedigera} dinMaskin={selMaskin === egenMaskinId}
          onOppnaObjekt={setSelObjekt}
          onClose={() => setSelMaskin(null)}
          onReorder={(ids) => skrivOrdning(selMaskin!, ids)}
          onOrdnaLage={hanteraOrdnaLage}
          onOrderChange={hanteraOrderChange}
          koRader={maskinKo.filter((k) => k.maskin_id === selMaskin).sort((a, b) => a.ordning - b.ordning)}
          kandidater={laggKandidater} kmTill={laggKmTill} onValjObjekt={valjLaggObjekt} onHighlight={setHighlightObjekt} onLaggLage={hanteraLaggLage}
        />
      )}

      {/* OBJEKT-ARK — tryck på en prick, eller på en rad i maskin-arket (då med pil tillbaka till maskinen). Samma ark för förare
          (läsläge: faror och hänsyn med planerarens kommentar, bärighet, Ring markägare) och förman (dessutom kö-knappar). */}
      {!laddar && !fel && kanOppnaArk && objektValt && (
        <ObjektArk key={objektValt.id} o={objektValt} skord={skord} warn={warnings[objektValt.id]}
          skordare={kobaraSkordare.map((m) => ({ id: m.maskin_id, namn: maskinNamnAv(m.maskin_id), koordinat: positions.get(m.maskin_id)?.koordinat ?? null, klararTyp: (m as any).klarar_typ ?? null }))}
          skotare={kobaraSkotare.map((m) => ({ id: m.maskin_id, namn: maskinNamnAv(m.maskin_id), skotarRoll: (m as any).skotar_roll ?? null }))}
          maskinNamn={maskinNamnAv} maskinRoll={maskinRollAv}
          maskinKo={maskinKo}
          forare={!kanRedigera}
          fornamn={fornamn} smsMaskin={maskinOrd(valt?.typ)}
          onLaggIKo={laggIKo} onFlytta={flyttaKo} onTaBort={taBortKo}
          onTillbaka={valt ? () => setSelObjekt(null) : undefined}
          onClose={() => { setSelObjekt(null); setSelMaskin(null); }}
        />
      )}

      {/* GROT-ARK: listan (chip) → tryck på rad → kartan flyger dit och arket byter till objektet; pilen tillbaka → listan.
          Bara förman — arket innehåller kö-knappar och markägarens uppgifter, så det renderas aldrig för någon annan. */}
      {!laddar && !fel && kanRedigera && !valt && !objektValt && grotOppen && grotLista && grotLista.alla.length > 0 && (
        valtGrotRad ? (
          <GrotObjektArk key={valtGrotRad.id} rad={valtGrotRad} idag={todayISO} skotare={grotSkotare} ko={koForGrotValt}
            onLaggIKo={grotLaggIKo} onTaBortKo={grotTaBortKo} onSpara={kanRedigera ? (patch) => grotSpara(valtGrotRad, patch) : undefined}
            onTillbaka={tillbakaTillGrotLista} onClose={stangGrot} />
        ) : (
          <GrotListaArk lista={grotLista} idag={todayISO} hogerText={grotHogerText} onOppna={(r) => setGrotValt(r.id)} onClose={stangGrot}
            startScroll={grotListRullRef.current} onScroll={(px) => { grotListRullRef.current = px; }}
            startLage={grotListLageRef.current} onLage={(l) => { grotListLageRef.current = l; }} />
        )
      )}
    </div>
  );
}

// ══════════════════════════════ MASKIN-ARK ═══════════════════════════════════
function aggFor(o: OversiktObjekt | null | undefined, skord: Record<string, SkordAggV2>): SkordAggV2 | undefined {
  return o?.vo_nummer ? skord[o.vo_nummer] : undefined;
}
const rowMeta = (agg: SkordAggV2 | undefined): string => agg?.sista ? `avverkat ${kortDatum(agg.sista)} · legat ${dagarSedan(agg.sista)} dgr` : '';
function volFor(f: MaskinForslag, o: OversiktObjekt, agg: SkordAggV2 | undefined): number | null {
  if (f.typ === 'skotare') return agg && agg.skordat > 0 ? paBackenKvar(agg.skordat, agg.skotat, agg.egenSkotning) : null;
  return o.volym_planerad ?? (o.volym || null);
}
const mapsHref = (o: OversiktObjekt | null): string | null => !o || o.lat == null || o.lng == null ? null
  : (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) ? `maps://maps.apple.com/?daddr=${o.lat},${o.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`);

const SvgVag = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>;
const SvgRing = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;


const HROW = 60; // px per rad i drag-listan
function ReorderLista({ rows, onDrop, onOrderChange }: { rows: { koId: string; namn: string; hoger: string }[]; onDrop: (order: string[]) => void; onOrderChange?: (order: string[]) => void }) {
  const nyckel = rows.map((r) => r.koId).join(',');
  const [order, setOrder] = useState<string[]>(() => rows.map((r) => r.koId));
  useEffect(() => { setOrder(rows.map((r) => r.koId)); }, [nyckel]); // eslint-disable-line react-hooks/exhaustive-deps
  const orderRef = useRef(order); orderRef.current = order;
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const [relY, setRelY] = useState(0);
  const contRef = useRef<HTMLDivElement>(null);
  const byId = new Map(rows.map((r) => [r.koId, r]));

  const move = (clientY: number) => {
    const id = dragRef.current; const cont = contRef.current; if (!id || !cont) return;
    const y = clientY - cont.getBoundingClientRect().top; setRelY(y);
    const cur = orderRef.current; const target = Math.max(0, Math.min(cur.length - 1, Math.floor(y / HROW)));
    const d = cur.indexOf(id);
    if (d >= 0 && d !== target) { const n = cur.filter((x) => x !== id); n.splice(target, 0, id); setOrder(n); onOrderChange?.(n); }
  };
  const start = (e: React.PointerEvent, koId: string) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); dragRef.current = koId; setDragId(koId); const cont = contRef.current; if (cont) setRelY(e.clientY - cont.getBoundingClientRect().top); };
  const end = () => { const id = dragRef.current; if (!id) return; dragRef.current = null; setDragId(null); onDrop(orderRef.current); };

  return (
    <div ref={contRef} style={{ position: 'relative', height: order.length * HROW, touchAction: 'none' }}>
      {order.map((koId, i) => {
        const r = byId.get(koId); if (!r) return null;
        const dragged = koId === dragId;
        const top = dragged ? Math.max(0, Math.min((order.length - 1) * HROW, relY - (HROW - 8) / 2)) : i * HROW;
        return (
          <div key={koId} style={{ position: 'absolute', left: 0, right: 0, top, height: HROW - 8, display: 'flex', alignItems: 'center', gap: AVSTAND.m, padding: `0 ${AVSTAND.s}px`, boxSizing: 'border-box', background: FARG.upphojt, borderRadius: RADIE.rad, boxShadow: dragged ? '0 8px 22px rgba(0,0,0,0.55)' : 'none', transform: dragged ? 'scale(1.03)' : 'none', zIndex: dragged ? 2 : 1, transition: dragged ? 'none' : 'top 180ms cubic-bezier(0.2,0,0,1)', ...TYP.text, ...TNUM }}>
            <div style={{ width: 20, color: FARG.text2, fontWeight: 600 }}>{i + 1}</div>
            <div style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.namn}</div>
            <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{r.hoger}</div>
            <div onPointerDown={(e) => start(e, koId)} onPointerMove={(e) => move(e.clientY)} onPointerUp={end} onPointerCancel={end}
              role="button" aria-label="Dra för att ändra ordning"
              style={{ width: 44, height: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', touchAction: 'none', color: FARG.text2, marginRight: -AVSTAND.s }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// En tryckbar rad i maskin-arket (Nu / 1 / 2 …): ett kort som i väljaren och drag-listan, minst 44 px högt — hela raden är träffytan.
const RAD_KORT: React.CSSProperties = { display: 'grid', columnGap: AVSTAND.m, rowGap: 2, alignItems: 'center', width: '100%', minHeight: 44, boxSizing: 'border-box', padding: AVSTAND.s, background: FARG.upphojt, color: FARG.text, border: 'none', borderRadius: RADIE.rad, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', ...TYP.text, ...TNUM };

// forare = LÄSLÄGE: inga skrivknappar (gäller förare på alla maskiner). dinMaskin = förarens egen maskin (märks i rubriken).
// Raderna Nu/1/2… öppnar objekt-arket via onOppnaObjekt.
function MaskinArk({ f, namn, legs, skord, warnings, telefon, forare, dinMaskin, onOppnaObjekt, onClose, onReorder, onOrdnaLage, onOrderChange, koRader, kandidater, kmTill, onValjObjekt, onHighlight, onLaggLage }: {
  f: MaskinForslag; namn: string; legs: (number | null)[]; skord: Record<string, SkordAggV2>; warnings: Record<string, ObjWarn>;
  telefon: string | null; forare: boolean; dinMaskin: boolean; onOppnaObjekt: (objektId: string) => void; onClose: () => void;
  onReorder: (orderedKoIds: string[]) => Promise<string | null>; onOrdnaLage: (active: boolean) => void; onOrderChange: (koIds: string[]) => void; koRader: MaskinKoItem[];
  kandidater: LaggKand[]; kmTill: (k: LaggKand) => number | null; onValjObjekt: (objektId: string) => Promise<string | null>; onHighlight: (objektId: string | null) => void; onLaggLage: (active: boolean) => void;
}) {
  const [ordnaLage, setOrdnaLage] = useState(false);
  const [laggLage, setLaggLage] = useState(false);
  const [sok, setSok] = useState('');
  // Köskrivningarna är verifierade (ko-skriv.ts): svaret är null när det landade, annars ett meddelande. Det visas HÄR, överst i
  // arket, tills nästa åtgärd — aldrig tyst. Flera kan vara på väg (de körs en i taget); ett fel försvinner inte av att en senare lyckas.
  const [sparar, setSparar] = useState(0);
  const [koFel, setKoFel] = useState<string | null>(null);
  const [ordnaNyckel, setOrdnaNyckel] = useState(0); // bumpas efter ett misslyckat släpp → dra-listan ritas om från kön som ligger i databasen
  const iFlykt = useRef(0);
  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);
  const felRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (koFel) felRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [koFel]); // arket kan vara rullat — felet ska synas
  const sparaKo = async (skrivning: () => Promise<string | null>): Promise<string | null> => {
    if (iFlykt.current === 0) setKoFel(null);
    iFlykt.current += 1; setSparar(iFlykt.current);
    const fel = await skrivning();
    iFlykt.current -= 1;
    if (levande.current) { setSparar(iFlykt.current); if (fel) setKoFel(fel); }
    return fel;
  };
  const nuAgg = aggFor(f.nuObjekt, skord);
  const rollLabel = f.typ === 'skotare' ? 'skotare' : 'skördare';
  const nuKvar = f.nuObjekt && nuAgg && nuAgg.skordat > 0 ? paBackenKvar(nuAgg.skordat, nuAgg.skotat, nuAgg.egenSkotning) : null;
  const nuVarde = f.typ === 'skotare' && nuKvar != null ? `${fmt(nuKvar)} m³ kvar` : '';
  const nasta = f.ko[0]?.objekt ?? null;
  const koPoster = f.ko.filter((p) => p.kalla === 'ko');          // kö: numrerad 1,2,…, ordningsbar
  const forslagPoster = f.ko.filter((p) => p.kalla === 'forslag'); // automatikens förslag: dämpad, ej ordningsbar
  const kanOrdna = koPoster.length > 1;                            // 'Ändra ordning' gäller BARA kö-raderna
  const koIdForObjekt = (objId: string) => koRader.find((k) => k.objekt_id === objId)?.id ?? null;
  // GROT-rad: virkesvolymen på backen hör inte till riset → bara km i högerkolumnen
  const hogerFor = (p: KoPost, i: number) => { const agg = aggFor(p.objekt, skord); const vol = arGrotKo(p.objekt) ? null : volFor(f, p.objekt, agg); const km = legs[i]; return [vol != null ? `${fmt(vol)} m³` : null, km != null ? `${Math.round(km)} km` : '–'].filter(Boolean).join(' · '); };
  const dragRader = koPoster.map((p, i) => ({ koId: koIdForObjekt(p.objekt.id) || '', namn: koNamn(p.objekt), hoger: hogerFor(p, i) })).filter((r) => r.koId); // kö-rader (= f.ko[0..koPoster.length])

  const toggleOrdna = () => { if (iFlykt.current === 0) setKoFel(null); setOrdnaLage((v) => { const nv = !v; onOrdnaLage(nv); return nv; }); };
  const oppnaLagg = () => { if (iFlykt.current === 0) setKoFel(null); setSok(''); setLaggLage(true); onLaggLage(true); };
  const stangLagg = () => { setLaggLage(false); onLaggLage(false); };
  const valj = (objektId: string) => { stangLagg(); void sparaKo(() => onValjObjekt(objektId)); };      // väljaren stängs direkt; resultatet visas i arket
  const slappOrdning = async (ids: string[]) => { const fel = await sparaKo(() => onReorder(ids)); if (fel && levande.current) setOrdnaNyckel((n) => n + 1); };
  const filtrerade = sok.trim() ? kandidater.filter((k) => k.namn.toLowerCase().includes(sok.trim().toLowerCase())) : kandidater;

  return (
    <div className="sheet-upp" style={{ ...SheetBas, ...((ordnaLage || laggLage) ? { maxHeight: '55vh', overflowY: 'auto' } : { boxSizing: 'border-box', maxHeight: '62%', overflowY: 'auto' }) }}>
      <Grabber onClose={onClose} />
      {laggLage ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ ...TYP.rubrik }}>Lägg till objekt</div>
            <button onClick={stangLagg} style={{ background: 'none', border: 'none', color: FARG.bla, ...TYP.text, cursor: 'pointer', padding: 0 }}>Avbryt</button>
          </div>
          {kandidater.length > 8 && (
            <input value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Sök objekt…" style={{ ...TYP.text, padding: `0 ${AVSTAND.m}px`, height: 44, boxSizing: 'border-box', borderRadius: RADIE.rad, border: '1px solid #48484a', background: FARG.upphojt, color: FARG.text, outline: 'none' }} />
          )}
          {filtrerade.length === 0 ? (
            <div style={{ ...TYP.meta, color: FARG.text2 }}>Inga objekt att lägga till.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtrerade.map((k) => {
                const iKo = !!k.koMaskinNamn; const km = kmTill(k);
                return (
                  <div key={k.id}
                    onPointerEnter={iKo ? undefined : () => onHighlight(k.id)}
                    onPointerLeave={iKo ? undefined : () => onHighlight(null)}
                    onClick={iKo ? undefined : () => valj(k.id)}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: AVSTAND.m, rowGap: 2, padding: `${AVSTAND.s}px`, borderRadius: RADIE.rad, background: FARG.upphojt, opacity: iKo ? 0.5 : 1, cursor: iKo ? 'default' : 'pointer', ...TYP.text, ...TNUM }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.namn}</div>
                    <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{km != null ? `${Math.round(km)} km` : '–'}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '1 / 3' }}>{k.atgard}{k.m3 != null ? ` · ${fmt(k.m3)} m³` : ''}{(k.koMaskinNamn || k.koInfo) ? ` · i kö för ${[k.koMaskinNamn, k.koInfo].filter(Boolean).join(', ')}` : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ ...TYP.rubrik }}>{namn}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{dinMaskin ? 'din maskin · ' : ''}{rollLabel}{f.manuellKo ? ' · manuell kö' : ''}</div>
      </div>
      {sparar > 0 && <div role="status" style={{ ...TYP.meta, color: FARG.text2 }}>Sparar…</div>}
      {koFel && <div ref={felRef} role="alert" style={{ ...TYP.meta, color: FARG.orange }}>{koFel}</div>}

      {/* Nu — står maskinen på ett känt objekt går raden att trycka på (objekt-arket) */}
      {f.nuObjekt ? (
        <button onClick={() => onOppnaObjekt(f.nuObjekt!.id)} aria-label={`Öppna ${f.nuObjekt.namn}`} style={{ ...RAD_KORT, gridTemplateColumns: '52px minmax(0, 1fr) auto' }}>
          <div style={{ color: FARG.text2 }}>Nu</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nuObjekt.namn}</div>
          <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{nuVarde}</div>
          {rowMeta(nuAgg) && (<><div /><div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>{rowMeta(nuAgg)}</div></>)}
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text, ...TNUM }}>
          <div style={{ color: FARG.text2 }}>Nu</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ color: FARG.text2 }}>okänd plats</span></div>
          <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{nuVarde}</div>
        </div>
      )}

      {/* Kö (numrerad, ordningsbar) + Förslag (dämpad). Varje rad går att trycka på → objekt-arket. */}
      {f.ko.length === 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', columnGap: AVSTAND.m, ...TYP.text }}><div style={{ color: FARG.text2 }}>Nästa</div><div style={{ color: FARG.text2 }}>inget planerat</div></div>
      ) : (ordnaLage && kanOrdna) ? (
        <ReorderLista key={ordnaNyckel} rows={dragRader} onDrop={slappOrdning} onOrderChange={onOrderChange} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, ...TYP.text, ...TNUM }}>
          {f.ko.map((p, i) => {
            const v = varnText(warnings[p.objekt.id]); const meta = rowMeta(aggFor(p.objekt, skord));
            const forstaForslag = p.kalla === 'forslag' && i === koPoster.length && koPoster.length > 0; // 'Förslag'-rubrik bara när kö finns ovanför
            return (
              <React.Fragment key={p.objekt.id}>
                {forstaForslag && <div style={{ ...TYP.micro, color: FARG.text2, marginTop: AVSTAND.xs }}>Förslag</div>}
                <button onClick={() => onOppnaObjekt(p.objekt.id)} aria-label={`Öppna ${p.objekt.namn}`} style={{ ...RAD_KORT, gridTemplateColumns: '32px minmax(0, 1fr) auto' }}>
                  <div style={{ color: FARG.text2 }}>{i + 1}</div>
                  <div style={{ fontWeight: p.troligt ? 400 : 600, color: p.troligt ? FARG.text2 : FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{koNamn(p.objekt)}</div>
                  <div style={{ color: FARG.text2, whiteSpace: 'nowrap' }}>{hogerFor(p, i)}</div>
                  {(meta || v || p.troligt) && (<><div /><div style={{ ...TYP.meta, color: FARG.text2, gridColumn: '2 / 4' }}>
                    {p.troligt ? 'troligt — kan ändras' : <>{meta}{meta && v ? ' · ' : ''}{v && <span style={{ color: v.color }}>{v.text}</span>}</>}
                  </div></>)}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Knappar */}
      {forare ? (
        mapsHref(nasta) && <a href={mapsHref(nasta)!} target="_blank" rel="noopener noreferrer" style={{ ...KNAPP, marginTop: AVSTAND.xs }}><SvgVag />Vägbeskrivning{nasta ? ` till ${nasta.namn}` : ''}</a>
      ) : (<>
        <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap' }}>
          {kanOrdna && (
            <button onClick={toggleOrdna} style={{ ...KNAPP_LITEN, borderColor: ordnaLage ? FARG.bla : '#48484a', color: ordnaLage ? FARG.bla : FARG.text }}>{ordnaLage ? 'Klar' : 'Ändra ordning'}</button>
          )}
          <button onClick={oppnaLagg} style={{ ...KNAPP_LITEN, borderColor: '#48484a', color: FARG.text }}>+ Lägg till objekt</button>
        </div>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
          {telefon && <a href={`tel:${telefon}`} style={KNAPP}><SvgRing />Ring</a>}
          {mapsHref(nasta) && <a href={mapsHref(nasta)!} target="_blank" rel="noopener noreferrer" style={KNAPP}><SvgVag />Vägbeskrivning</a>}
        </div>
      </>)}
      </>)}
    </div>
  );
}

// ══════════════════════════════ OBJEKT-ARK ═══════════════════════════════════
function klararObjekt(klararTyp: string | null, typ: string | undefined): boolean {
  const k = (klararTyp || 'bada').toLowerCase();
  return k === 'bada' || k === typ; // 'bada' klarar allt, annars måste typ matcha
}
// Skotarens roll mot objekttyp (speglar nasta-v2 rollMatchar): 'allt' tar allt, annars typ===roll.
function rollMatcharTyp(roll: string | null, typ: string | undefined): boolean {
  if (roll === 'allt') return true;
  return (roll === 'slutavverkning' || roll === 'gallring') && roll === typ;
}
const SvgTillbaka = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

const SvgSms = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.2-4.3A8 8 0 1 1 21 12z" /></svg>;

type KobarMaskin = { id: string; namn: string; roll: MaskinTyp };
// forare = LÄSLÄGE: inga kö-knappar. Allt annat — faror/hänsyn med kommentar, bärighet, Ring och Sms till markägaren — visas för både
// förare och förman. onTillbaka finns när arket öppnats från en rad i maskin-arket (pilen går tillbaka dit).
// Köåtgärderna är verifierade och svarar null när det landade, annars ett meddelande som visas här under knapparna (aldrig tyst).
// Sms-knappen öppnar telefonens sms-app med färdig text — appen skickar ALDRIG något själv.
function ObjektArk({ o, skord, warn, skordare, skotare, maskinNamn, maskinRoll, maskinKo, forare, fornamn, smsMaskin, onLaggIKo, onFlytta, onTaBort, onTillbaka, onClose }: {
  o: OversiktObjekt; skord: Record<string, SkordAggV2>; warn: ObjWarn | undefined;
  skordare: { id: string; namn: string; koordinat: { lat: number; lng: number } | null; klararTyp: string | null }[];
  skotare: { id: string; namn: string; skotarRoll: string | null }[];
  maskinNamn: (id: string) => string; maskinRoll: (id: string) => MaskinTyp | null; maskinKo: MaskinKoItem[]; forare: boolean;
  /** Inloggades förnamn (sms:et skrivs i det) och maskinen arket kom från ("maskinen" när objektet öppnats direkt från kartan). */
  fornamn: string | null; smsMaskin: MaskinOrd;
  onLaggIKo: (maskinId: string, objektId: string) => Promise<string | null>; onFlytta: (koId: string, tillMaskin: string) => Promise<string | null>; onTaBort: (koId: string) => Promise<string | null>;
  onTillbaka?: () => void; onClose: () => void;
}) {
  const [avstand, setAvstand] = useState<Record<string, number | null>>({});
  const [valjFlytt, setValjFlytt] = useState<string | null>(null); // kö-rad (id) vars "Flytta till …"-val är öppet
  const [arbetar, setArbetar] = useState(false);
  const [meddelande, setMeddelande] = useState<string | null>(null);
  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);
  const felRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (meddelande) felRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [meddelande]); // arket rullar — felet ska synas
  const kor = async (skrivning: () => Promise<string | null>) => {
    if (arbetar) return;
    setArbetar(true); setMeddelande(null);
    const fel = await skrivning();
    if (levande.current) { setArbetar(false); setMeddelande(fel); }
  };
  const agg = aggFor(o, skord);
  const areal = o.areal ? `${o.areal.toLocaleString('sv-SE')} ha` : null;
  const atgard = o.atgard || (o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning');
  const vol = o.volym_planerad ?? (o.volym || null);
  const bar = barighetText(o.barighet);
  const ringHref = telHref(o.markagare_tel);
  const smsLank = smsHref(o.markagare_tel, smsText({ fornamn, maskin: smsMaskin, objektnamn: rensaObjektnamn(o.namn, o.vo_nummer) }), typeof navigator !== 'undefined' && arIos(navigator.userAgent, navigator.maxTouchPoints));
  const vantatDatum = (o as any).klar_skickad_timestamp || (o as any).created_at || null;
  // Kö över roller: objektet kan ligga i EN skördares och EN skotares kö samtidigt — en kö-rad per roll. Skördare först.
  const rang = (id: string) => (maskinRoll(id) === 'skotare' ? 1 : 0);
  const koRader = maskinKo.filter((k) => k.objekt_id === o.id).sort((a, b) => rang(a.maskin_id) - rang(b.maskin_id) || maskinNamn(a.maskin_id).localeCompare(maskinNamn(b.maskin_id), 'sv'));
  // Lägg-i-kö-kandidater: skördare (klarar_typ) + skotare (skotar_roll mot objekttyp).
  const eligible: KobarMaskin[] = [
    ...skordare.filter((s) => klararObjekt(s.klararTyp, o.typ)).map((s) => ({ id: s.id, namn: s.namn, roll: 'skordare' as const })),
    ...skotare.filter((s) => rollMatcharTyp(s.skotarRoll, o.typ)).map((s) => ({ id: s.id, namn: s.namn, roll: 'skotare' as const })),
  ];
  // Att lägga i kö: bara maskiner vars roll inte redan har objektet. En annan roll än den som har det går bra.
  const attLagga = eligible.filter((s) => koLaget({ objektId: o.id, maskinId: s.id, roll: s.roll, ko: maskinKo, rollAv: maskinRoll, namnAv: maskinNamn }).spar.length === 0);
  // Att flytta en kö-rad till: andra maskiner av SAMMA roll som inte redan har objektet.
  const flyttMal = (r: MaskinKoItem) => eligible.filter((s) => s.roll === maskinRoll(r.maskin_id) && s.id !== r.maskin_id && !koRader.some((x) => x.maskin_id === s.id));
  const knappStil = (stil: React.CSSProperties): React.CSSProperties => (arbetar ? { ...stil, ...INAKTIV } : stil);

  useEffect(() => {
    let c = false;
    (async () => {
      if (o.lat == null || o.lng == null) return;
      const r: Record<string, number | null> = {};
      for (const s of skordare) { if (s.koordinat) r[s.id] = await vagKm(s.koordinat, { lat: o.lat!, lng: o.lng! }); }
      if (!c) setAvstand(r);
    })();
    return () => { c = true; };
  }, [o.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const avstText = skordare.filter((s) => s.koordinat).map((s) => `${avstand[s.id] != null ? Math.round(avstand[s.id]!) : '–'} km från ${s.namn}`).join(' · ') || '–';
  const rad = (label: string, val: React.ReactNode) => (<><div style={{ color: FARG.text2 }}>{label}</div><div>{val}</div></>);

  return (
    <div className="sheet-upp" style={{ ...SheetBas, boxSizing: 'border-box', maxHeight: '62%', overflowY: 'auto' }}>
      <Grabber onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}>
        {onTillbaka && (
          <button onClick={onTillbaka} aria-label="Tillbaka till maskinen"
            style={{ width: 44, height: 44, minWidth: 44, marginLeft: -AVSTAND.m, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: FARG.text2, cursor: 'pointer' }}>
            <SvgTillbaka />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
          <a href={`/planering?valt=${o.id}`} style={{ ...TYP.rubrik, color: FARG.text, textDecoration: 'none', minWidth: 0 }}>{o.namn} <span style={{ ...TYP.meta, color: FARG.text2 }}>›</span></a>
          <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>{koRader.length ? `i kö` : harMaskin(o) ? 'planerad' : 'väntar · ingen maskin'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: AVSTAND.m, rowGap: AVSTAND.s, ...TYP.text }}>
        {rad('Åtgärd', `${atgard}${areal ? ` · ${areal}` : ''}`)}
        {rad('Volym', vol != null ? `${fmt(vol)} m³ planerat` : '–')}
        <VarningRader faror={warn?.faror ?? []} hansyn={warn?.hansyn ?? []} />
        {rad('Bärighet', bar ? <span style={{ color: bar.begransning ? FARG.orange : FARG.text }}>{bar.text}</span> : <span style={{ color: FARG.text2 }}>–</span>)}
        {rad('Avstånd', <span style={{ color: FARG.text2 }}>{avstText}</span>)}
        {rad('Väntat', <span style={{ color: FARG.text2 }}>{vantatDatum ? `sedan ${kortDatum(vantatDatum)} · ${dagarSedan(vantatDatum)} dgr` : '–'}</span>)}
      </div>

      {(ringHref || smsLank) && (
        <div style={{ display: 'flex', gap: AVSTAND.s, flexWrap: 'wrap', marginTop: AVSTAND.xs }}>
          {ringHref && <a href={ringHref} style={KNAPP}><SvgRing />Ring markägare</a>}
          {smsLank && <a href={smsLank} style={KNAPP}><SvgSms />Sms markägaren</a>}
        </div>
      )}

      {!forare && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {koRader.map((r) => {
            const plats = maskinKo.filter((k) => k.maskin_id === r.maskin_id).sort((a, b) => a.ordning - b.ordning).findIndex((k) => k.id === r.id) + 1;
            const mal = flyttMal(r);
            return (
              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>I kö för {maskinNamn(r.maskin_id)} · {plats}:a</div>
                <div style={{ display: 'flex', gap: AVSTAND.s }}>
                  {mal.length > 0 && <button disabled={arbetar} onClick={() => setValjFlytt((x) => (x === r.id ? null : r.id))} style={knappStil(KNAPP_LITEN)}>Flytta till …</button>}
                  <button disabled={arbetar} onClick={() => kor(() => onTaBort(r.id))} style={knappStil({ ...KNAPP_LITEN, color: FARG.rod })}>Ta bort ur kön</button>
                </div>
                {valjFlytt === r.id && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
                    {mal.map((s) => (
                      <button key={s.id} disabled={arbetar} onClick={() => { setValjFlytt(null); void kor(() => onFlytta(r.id, s.id)); }} style={knappStil({ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px` })}>{s.namn}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {attLagga.length === 1 ? (
            <button disabled={arbetar} onClick={() => kor(() => onLaggIKo(attLagga[0].id, o.id))} style={knappStil({ ...KNAPP, marginTop: AVSTAND.xs })}>+ Lägg i kö för {attLagga[0].namn}</button>
          ) : attLagga.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              <div style={{ ...TYP.micro, color: FARG.text2 }}>Lägg i kö för</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
                {attLagga.map((s) => <button key={s.id} disabled={arbetar} onClick={() => kor(() => onLaggIKo(s.id, o.id))} style={knappStil({ ...KNAPP_LITEN, flexGrow: 0, padding: `0 ${AVSTAND.l}px` })}>+ {s.namn}</button>)}
              </div>
            </div>
          ) : koRader.length === 0 ? <div style={{ ...TYP.meta, color: FARG.text2 }}>Ingen maskin passar den här åtgärden.</div> : null}
          {arbetar && <div role="status" style={{ ...TYP.meta, color: FARG.text2 }}>Sparar…</div>}
          {meddelande && <div ref={felRef} role="alert" style={{ ...TYP.meta, color: FARG.orange }}>{meddelande}</div>}
        </div>
      )}
    </div>
  );
}
