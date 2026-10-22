// OM TRAKTEN — listans innehåll: EN rad per TYP, i grupper. Rena funktioner (sidan går inte att montera i test).
//
//   FAROR (röd, alltid först) · FRÅN VIDA (texten) · HÄNSYN · VÄGAR · ÖVRIGT
//   "Basväg · 3 st · 905 m ›", "Röd väg · 3 st ›", "Stenmur · 1 st ›", "Hänsynsytor · 1 st ›",
//   "Högstubbar · 3 av 11 markerade ›" (certifierat: kravet utskrivet; uppfyllt "11 av 11 markerade ✓").
// Varje markering syns — med eller utan kommentar. Kommentaren och fotot visas när man öppnar typen (raden i typvyn), aldrig som eget format i listan.
// Tryck på en rad = typvyn (alla av typen markeras på kartan, objekten listas); tryck på ett objekt = kartan zoomar dit.

import { basvagSammanfattning, basvagText } from './basvag';
import { arBasvag, harText, markeringsGrupp, sorteraMarkeringar, type KartMarkering, type MarkeringMedAvstand } from './objektKort';

export type OmGrupp = 'faror' | 'vida' | 'hansyn' | 'vagar' | 'ovrigt';
export const OM_GRUPPER_I_ORDNING: OmGrupp[] = ['faror', 'vida', 'hansyn', 'vagar', 'ovrigt'];
export const OM_GRUPP_RUBRIK: Record<OmGrupp, string> = { faror: 'Faror', vida: 'Från Vida', hansyn: 'Hänsyn', vagar: 'Vägar', ovrigt: 'Övrigt' };

// Hänsyn: naturvård och kultur hör ihop (Martin 2026-10-17) — kulturminne, stenmur och fornlämning ligger bredvid högstubbar och evighetsträd, inte i en egen kortvariant.
const HANSYN_SYMBOLER = new Set(['highstump', 'eternitytree', 'naturecorner', 'culturemonument', 'culturestump']);
const HANSYN_LINJER = new Set(['nature', 'stonewall']);
const HANSYN_ZONER = new Set(['protected', 'culture', 'fornlamning']);

/** Gruppen en markering hör till. Faror och vägar som tidigare (lib/objektKort.markeringsGrupp); därefter hänsyn; resten är övrigt. */
export function omGrupp(m: Pick<KartMarkering, 'slag' | 'typ'>): OmGrupp {
  const g = markeringsGrupp(m);
  if (g === 'faror') return 'faror';
  if (g === 'vagar') return 'vagar';
  if (m.slag === 'symbol') return HANSYN_SYMBOLER.has(m.typ) ? 'hansyn' : 'ovrigt';
  if (m.slag === 'linje') return HANSYN_LINJER.has(m.typ) ? 'hansyn' : 'ovrigt';
  return HANSYN_ZONER.has(m.typ) ? 'hansyn' : 'ovrigt';
}

/** Ytorna som inte är markeringar (Vidas traktdelar, våra egna områden) får rader på samma sätt. Hänsynsytor är markeringar (kalla 'vida' eller egen) och blir EN rad. */
const YTA_PLURAL: Record<string, { namn: string; grupp: OmGrupp }> = {
  'Traktdel': { namn: 'Traktdelar', grupp: 'ovrigt' },
  'Eget område': { namn: 'Egna områden', grupp: 'ovrigt' },
};

export interface MiljoIn { id: 'hogstubbar' | 'evighetstrad'; namn: string; antal: number; krav: number | null; uppfyllt: boolean }

export interface TypRad {
  nyckel: string;
  grupp: OmGrupp;
  /** raden: "Basväg", "Röd väg", "Högstubbar" */
  namn: string;
  /** antal markeringar (ytor: antal ytor) */
  antal: number;
  /** basväg: "3 st · 905 m" (saknas längden på någon står bara antalet) — annars null */
  basvag: string | null;
  /** högstubbar/evighetsträd: antal satta (med `antal` per symbol) och kravet — null krav = bara antalet */
  miljo: { satta: number; krav: number | null; uppfyllt: boolean } | null;
  /** raden hör till ytorna med den här typen (OmYta.typLabel); markeringar är då tom */
  ytaTyp: string | null;
  markeringar: MarkeringMedAvstand[];
}
export interface OmGruppRader { grupp: OmGrupp; rubrik: string; rader: TypRad[] }

/** Texten på raden utan chevron och utan bock: "Basväg · 3 st · 905 m", "Röd väg · 3 st", "Högstubbar · 3 av 11 markerade". */
export function typRadText(r: Pick<TypRad, 'namn' | 'antal' | 'basvag' | 'miljo'>): string {
  if (r.miljo) return r.miljo.krav != null ? `${r.namn} · ${r.miljo.satta} av ${r.miljo.krav} markerade` : `${r.namn} · ${r.miljo.satta} st`;
  if (r.basvag) return `${r.namn} · ${r.basvag}`;
  return `${r.namn} · ${r.antal} st`;
}

const KORT_VAG_KOMMENTAR = 24;

/** Namnet i Om trakten. Ritade hänsynsytor heter zonens eget namn "Hänsyn" på kartan — här "Hänsynsyta", så att raden inte heter som gruppen HÄNSYN. */
export const omNamn = (m: Pick<KartMarkering, 'slag' | 'typ' | 'namn'>): string => (m.slag === 'zon' && m.typ === 'protected' ? 'Hänsynsyta' : String(m.namn ?? ''));

/** Typer som finns både från Vida och från oss: EN rad per typ, och källan står först när objektet öppnas (listen nertill / ytkortet). */
const BLANDAD_KALLA = new Set(['zon:protected', 'symbol:landing']);

/** Första ringen/linjen ur en GeoJSON-geometri som lat/lng (Polygon, MultiPolygon, LineString); null när den saknas. */
export function punkterUrGeometri(g: unknown): { lat: number; lng: number }[] | null {
  const geo = g as { type?: string; coordinates?: unknown } | null | undefined;
  if (!geo || !Array.isArray(geo.coordinates)) return null;
  const c = geo.coordinates as unknown[];
  const ring: unknown = geo.type === 'Polygon' ? c[0] : geo.type === 'MultiPolygon' ? (c[0] as unknown[] | undefined)?.[0] : geo.type === 'LineString' ? c : null;
  if (!Array.isArray(ring)) return null;
  const ut = (ring as unknown[]).flatMap((p) => (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [{ lat: p[1] as number, lng: p[0] as number }] : []));
  return ut.length > 0 ? ut : null;
}

/** Mitten av punkterna (medelvärdet) — var en yta pekas ut på kartan. */
export const mittAvPunkter = (pts: readonly { lat: number; lng: number }[]): { lat: number; lng: number } => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
const versal = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const norm = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();

/** Vilken rad en markering räknas till: [nyckel, rubrik]. En väg-symbol med kort kommentar ("Röd väg") får EN rad per kommentar; övriga en rad per typ. */
function radFor(m: KartMarkering): { nyckel: string; namn: string } {
  if (m.slag === 'symbol' && m.typ === 'highstump') return { nyckel: 'miljo:hogstubbar', namn: 'Högstubbar' };
  if (m.slag === 'symbol' && (m.typ === 'eternitytree' || m.typ === 'naturecorner')) return { nyckel: 'miljo:evighetstrad', namn: 'Evighetsträd' };
  if (m.slag === 'symbol' && m.typ === 'road') {
    const k = m.comment.trim();
    if (k && k.length <= KORT_VAG_KOMMENTAR && !(m.photoPath || m.photoData || m.fotoVantar)) return { nyckel: `symbol:road:${norm(k)}`, namn: versal(k.replace(/\s+/g, ' ')) };
  }
  return { nyckel: `${m.slag}:${m.typ}`, namn: versal(omNamn(m) || m.typ) };
}

const langd = (m: KartMarkering): number => (m.langdM != null && Number.isFinite(m.langdM) ? m.langdM : -1);

/**
 * Grupperna med en rad per typ. `miljo` = de två räknarna (högstubbar, evighetsträd) för raderna med kravet utskrivet — null när man söker (då räknas bara träffarna).
 * Inom en grupp: basväg först i Vägar, högstubbar/evighetsträd först i Hänsyn, sedan flest först. Inom en rad: vägar längst först, annars närmast (pos) eller i skapad ordning.
 * `ytor` = typLabel för varje yta. Tomma grupper finns inte.
 */
export function byggOmGrupper(ms: readonly KartMarkering[], pos: { lat: number; lng: number } | null, miljo: readonly MiljoIn[] | null, ytor: readonly string[] = []): OmGruppRader[] {
  const sorterade = sorteraMarkeringar(ms, pos);
  const rader = new Map<string, TypRad>();
  for (const m of sorterade) {
    const { nyckel, namn } = radFor(m);
    const g = rader.get(nyckel);
    if (g) { g.markeringar.push(m); continue; }
    rader.set(nyckel, { nyckel, grupp: omGrupp(m), namn, antal: 0, basvag: null, miljo: null, ytaTyp: null, markeringar: [m] });
  }
  // Certifierat objekt: raden finns även när inget är satt än ("Högstubbar · 0 av 11 markerade") — kravet är det man ska se.
  for (const mi of miljo ?? []) {
    if (mi.krav == null) continue;
    const nyckel = `miljo:${mi.id}`;
    if (!rader.has(nyckel)) rader.set(nyckel, { nyckel, grupp: 'hansyn', namn: mi.namn, antal: 0, basvag: null, miljo: null, ytaTyp: null, markeringar: [] });
  }
  for (const r of Array.from(rader.values())) {
    r.antal = r.markeringar.length;
    if (r.nyckel === 'zon:protected') r.namn = r.antal === 1 ? 'Hänsynsyta' : 'Hänsynsytor';   // Vidas och våra hänsynsytor är EN rad
    const mi = r.nyckel.startsWith('miljo:') ? (miljo ?? []).find((x) => `miljo:${x.id}` === r.nyckel) : undefined;
    if (r.nyckel.startsWith('miljo:')) {
      const satta = mi ? mi.antal : r.markeringar.reduce((s, m) => s + (m.antal != null && m.antal > 0 ? m.antal : 1), 0);
      r.miljo = { satta, krav: mi ? mi.krav : null, uppfyllt: !!mi?.uppfyllt };
    }
    if (r.markeringar.every(arBasvag) && r.markeringar.length > 0) {
      r.namn = 'Basväg';
      r.basvag = basvagSammanfattning(r.markeringar.map((m) => m.langdM));
      r.markeringar.sort((a, b) => langd(b) - langd(a));
    }
  }
  const ytaAntal = new Map<string, number>();
  for (const t of ytor) ytaAntal.set(t, (ytaAntal.get(t) ?? 0) + 1);
  for (const [typ, n] of Array.from(ytaAntal.entries())) {
    const p = YTA_PLURAL[typ] ?? { namn: `${typ}`, grupp: 'ovrigt' as OmGrupp };
    const nyckel = `yta:${typ}`;
    rader.set(nyckel, { nyckel, grupp: p.grupp, namn: p.namn, antal: n, basvag: null, miljo: null, ytaTyp: typ, markeringar: [] });
  }
  // Först i sin grupp: basvägen (Vägar), högstubbar och sedan evighetsträd (Hänsyn) — resten flest först.
  const forst = (r: TypRad): number => (r.basvag != null ? 0 : r.nyckel === 'miljo:hogstubbar' ? 0 : r.nyckel === 'miljo:evighetstrad' ? 1 : 2);
  return OM_GRUPPER_I_ORDNING.map((grupp) => ({
    grupp,
    rubrik: OM_GRUPP_RUBRIK[grupp],
    rader: Array.from(rader.values()).filter((r) => r.grupp === grupp).sort((a, b) => forst(a) - forst(b) || b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv')),
  })).filter((g) => g.rader.length > 0);
}

/**
 * Kortets rad "På trakten N markeringar · M med text": SAMMA objekt som Om trakten listar — markeringarna (Vidas och våra) plus ytorna som inte är markeringar
 * (traktdelar, egna områden). Ett tal på kortet som inte går att hitta i listan vore ett fel. "Med text" = kommentar, foto eller (ytor) en anteckning.
 */
export function omSammanfattning(ms: readonly KartMarkering[], ovrigaYtor: readonly { harText: boolean }[]): { antal: number; medText: number } {
  return { antal: ms.length + ovrigaYtor.length, medText: ms.filter((m) => harText(m) || !!(m.photoPath || m.photoData || m.fotoVantar)).length + ovrigaYtor.filter((y) => y.harText).length };
}

/** Antalet faror (rubrikens tal): markeringar i gruppen Faror. */
export const antalFaror = (g: readonly OmGruppRader[]): number => g.find((x) => x.grupp === 'faror')?.rader.reduce((s, r) => s + r.antal, 0) ?? 0;

/** Raden i typvyns lista: basväg = "Basväg röd · 640 m", annars symbolens namn. Kommentaren är en rad under (aldrig huvudtext). */
export const objektTitel = (m: KartMarkering): string => (arBasvag(m) ? basvagText(m.farg, m.langdM) : omNamn(m));

// ── Texten i listen nertill när ETT objekt visas ──────────────────────────────────────────────────────────────────
/** "Basväg röd · 329 m" / "Högstubbe" / "Kulturminne · Stenrös vid vägen" — det som står i NedfaldList. */
export function listText(m: Pick<KartMarkering, 'comment' | 'namn' | 'typ' | 'slag' | 'farg' | 'langdM' | 'kalla'>): string {
  if (arBasvag(m)) return basvagText(m.farg, m.langdM);
  const k = String(m.comment ?? '').trim().replace(/\s+/g, ' ');
  // Källan syns först här: för typer som finns från både Vida och oss står "från Vida" respektive "egen".
  const kalla = BLANDAD_KALLA.has(`${m.slag}:${m.typ}`) ? (m.kalla === 'vida' ? 'från Vida' : 'egen') : '';
  return [omNamn(m), kalla, k].filter(Boolean).join(' · ');
}

// ── Brandrisk: bara när någon dag är 3 eller högre ──────────────────────────────────────────────────────────────
export const BRAND_GRANS = 3;
export interface BrandDagDatum { datum: string; klass: number }
/** Dagens namn i löpande text: idag, i morgon, annars veckodag ("onsdag"). `idagIso`/`datum` är ISO-datum. */
export function dagText(datum: string, idagIso: string): string {
  if (datum === idagIso) return 'idag';
  const t = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const diff = Math.round((t(datum) - t(idagIso)) / 86400000);
  if (diff === 1) return 'i morgon';
  return new Date(t(datum)).toLocaleDateString('sv-SE', { weekday: 'long', timeZone: 'UTC' });
}
export interface BrandRadText { klass: number; text: string; ton: 'neutral' | 'orange' | 'rod' }
/**
 * Raden: "Brandrisk 3 på onsdag" (3), orange vid 4, röd vid 5; 5E ("Extrem", klass 6): "Brandrisk 5E på torsdag – inga band".
 * Visar den HÖGSTA dagen (den första om flera) bland de fem; ingen dag ≥ 3 → null (ingen rad).
 */
export function brandRadText(dagar: readonly BrandDagDatum[], idagIso: string): BrandRadText | null {
  let topp: BrandDagDatum | null = null;
  for (const d of dagar) if (d.klass >= BRAND_GRANS && (!topp || d.klass > topp.klass)) topp = d;
  if (!topp) return null;
  const nar = dagText(topp.datum, idagIso);
  const pa = nar === 'idag' || nar === 'i morgon' ? nar : `på ${nar}`;
  if (topp.klass >= 6) return { klass: 6, text: `Brandrisk 5E ${pa} – inga band`, ton: 'rod' };
  return { klass: topp.klass, text: `Brandrisk ${topp.klass} ${pa}`, ton: topp.klass >= 5 ? 'rod' : topp.klass === 4 ? 'orange' : 'neutral' };
}
