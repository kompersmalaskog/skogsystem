// PLATS-SÖK för Starta jobb: "Sök fastighet" (text → position) och "närmaste ortnamn" (position → förslag på jobbets namn).
//
// Leverantör = OpenRouteService geocoder (Pelias), samma nyckel som lib/geokod och km-beräkningen, begränsad till Sverige. OBS: ORS känner
// ORT-, BY-, GÅRDS- och ADRESSNAMN — inte fastighetsbeteckningar ("Hållsta 2:7"). Ingen fastighetsregister-tjänst med inloggning finns i appen
// (Lantmäteriets WMS ger bara kartbilden). Sökningen ger därför byn/gården/adressen som fastigheten ligger vid; föraren bekräftar punkten på kartan.
//
// Rena tolkare (testade i platsSok.test.ts) + tunn I/O (kallas bara från /api/plats, aldrig från klienten — nyckeln stannar på servern).

export interface PlatsTraff {
  etikett: string;
  namn: string;
  lat: number;
  lng: number;
  /** Pelias-lager: venue, address, locality, neighbourhood, localadmin, … */
  lager: string;
  /** Avstånd i meter (bara vid reverse-sökning). */
  avstandM: number | null;
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function tolkaFeature(f: any): PlatsTraff | null {
  const c = f?.geometry?.coordinates;
  const lng = num(c?.[0]), lat = num(c?.[1]);
  if (lat == null || lng == null) return null;
  const p = f?.properties || {};
  const etikett = String(p.label || p.name || '').trim();
  const namn = String(p.name || p.label || '').trim();
  if (!etikett) return null;
  const km = num(p.distance);
  return { etikett, namn: namn || etikett, lat, lng, lager: String(p.layer || ''), avstandM: km == null ? null : Math.round(km * 1000) };
}

/** ORS /geocode/search → upp till `max` träffar i Sverige-rimliga koordinater. */
export function tolkaPlatsLista(json: any, max = 6): PlatsTraff[] {
  const ut: PlatsTraff[] = [];
  const seen = new Set<string>();
  for (const f of json?.features || []) {
    const t = tolkaFeature(f);
    if (!t) continue;
    if (t.lat < 54 || t.lat > 70 || t.lng < 9 || t.lng > 25) continue;
    const k = `${t.etikett}|${t.lat.toFixed(4)}|${t.lng.toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    ut.push(t);
    if (ut.length >= max) break;
  }
  return ut;
}

/** Lager i den ordning vi vill föreslå ett NAMN på ett skogsjobb: by/gård/område före kommun. */
const LAGER_RANK: Record<string, number> = { venue: 0, neighbourhood: 1, locality: 2, borough: 3, localadmin: 4 };

/** ORS /geocode/reverse → det närmaste ORTNAMNET (by/gård/område), annars null. Ett avstånd över `maxM` räknas inte som "nära". */
export function tolkaNarmasteOrt(json: any, maxM = 5000): { namn: string; avstandM: number | null; lager: string } | null {
  const traffar = tolkaPlatsLista(json, 20).filter((t) => t.lager in LAGER_RANK && t.namn);
  if (traffar.length === 0) return null;
  traffar.sort((a, b) => {
    const da = a.avstandM ?? Infinity, db = b.avstandM ?? Infinity;
    // Avstånd först (avrundat till 100 m så en by på samma plats som en gård inte avgörs av brus), sedan lager.
    const ra = Math.round(da / 100), rb = Math.round(db / 100);
    if (ra !== rb) return ra - rb;
    return (LAGER_RANK[a.lager] ?? 9) - (LAGER_RANK[b.lager] ?? 9);
  });
  const b = traffar[0];
  if (b.avstandM != null && b.avstandM > maxM) return null;
  return { namn: b.namn, avstandM: b.avstandM, lager: b.lager };
}

const ORS = 'https://api.openrouteservice.org/geocode';

async function hamta(url: string): Promise<{ ok: true; json: any } | { ok: false; fel: string }> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return { ok: false, fel: `Kartleverantören svarade ${r.status}` };
    return { ok: true, json: await r.json() };
  } catch (e: any) {
    return { ok: false, fel: `Kartleverantören svarade inte (${e?.message || e})` };
  }
}

export async function sokPlats(q: string): Promise<{ ok: true; traffar: PlatsTraff[] } | { ok: false; fel: string }> {
  const key = process.env.ORS_API_KEY;
  if (!key) return { ok: false, fel: 'Platssökning ej konfigurerad (ORS_API_KEY saknas)' };
  const r = await hamta(`${ORS}/search?api_key=${encodeURIComponent(key)}&text=${encodeURIComponent(q)}&boundary.country=SE&size=8`);
  return r.ok ? { ok: true, traffar: tolkaPlatsLista(r.json) } : r;
}

export async function narmasteOrtnamn(lat: number, lng: number): Promise<{ ok: true; ort: ReturnType<typeof tolkaNarmasteOrt> } | { ok: false; fel: string }> {
  const key = process.env.ORS_API_KEY;
  if (!key) return { ok: false, fel: 'Platssökning ej konfigurerad (ORS_API_KEY saknas)' };
  const r = await hamta(`${ORS}/reverse?api_key=${encodeURIComponent(key)}&point.lon=${lng}&point.lat=${lat}&boundary.country=SE&size=10&layers=venue,neighbourhood,locality,borough,localadmin`);
  return r.ok ? { ok: true, ort: tolkaNarmasteOrt(r.json) } : r;
}
