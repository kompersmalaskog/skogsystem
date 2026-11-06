// Servern för skotarlänken /skotare/<token> (en EXTERN skotare, t.ex. markägarens egen, som skotar efter vår skördare).
// Allt körs med SERVICE-klienten (ingen anon-åtkomst till tabellerna) och lämnar ut EXAKT det sidan visar, för det ENA objektet:
//   traktgränsen · skördarens körspår (utjämnat, utan tider) · produktionshögarna (m³fub per trädslag, minus det som skotats)
//   · planerarens markeringar (fält ur en vitlista, inga personnamn) med kommentarernas TEXT (aldrig vem som skrev)
//   · Vidas lager (ur en vitlista: linjer, hänsyn, avlägg, nyckelbiotop, fornlämning — aldrig fastigheterna runt omkring, aldrig larmpunkten).
// Aldrig: andra objekt, maskinernas position, förarnamn, priser, dagsvolymer, markägare, VO-nummer.
//
// Ren från Next: rutterna är tunna och returnerar `{ status, body }` härifrån, så reglerna kan testas utan nätverk.

import type { SupabaseClient } from '@supabase/supabase-js';
import { beslutaOrigo, KVITTO, lasVidaGrans, markeringsGranser, markeringsPunkter, type VidaGrans } from '@/lib/egenkontrollOrigo';
import { svgToLatLon, type Origo } from '@/lib/kartkoordinater';
import { objektStartKamera } from '@/lib/objektFlyg';
import { hamtaAltNummer, hogarObjektIds } from '@/lib/objektNummer';
import { hyttsparRitadeLinjer } from '@/lib/sparJamning';
import { byggStrak } from '@/lib/strak';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { markerNyckel } from '@/lib/kartkommentar';
import { LASS_SELECT, lassFranServer } from '@/lib/skotarLass/server';
import type { Lass } from '@/lib/skotarLass/typer';
import { lasMarkeringRad, type HogMarkering } from '@/lib/skotarHogarKvar';
import { besokNamn } from '@/lib/besok/namn';
import { MARKERING_FOTO_BUCKET } from '@/lib/markeringFotoSokvag';
import { arGiltigtSkotarToken } from './offentlig';
import { skotarHogar, type HogarSvar, type Stam } from './hogar';
import { byggAvlagg, lassSortiment, type Avlagg, type EgetAvlaggRad, type LassRad } from './avlagg';
import { sattSortimentKlass, sortimentVisning } from '@/lib/skotarLass/sortiment';

type Sb = SupabaseClient;
export type Svar = { status: number; body: Record<string, unknown> };
export type LngLat = [number, number];

const FEL = (status: number, fel: string): Svar => ({ status, body: { ok: false, fel } });

// ---- Länken ---------------------------------------------------------------------------------------------------------------------------------

export type ObjektRad = { id: string; namn: string; anteckningar?: string | null; vo_nummer: string | null; status: string | null; lat: number | null; lng: number | null; kartbild_bounds: unknown; fastighetsbeteckning: string | null; dim_objekt_id: string | null };
export type LankUtfall = { ok: true; objekt: ObjektRad } | { ok: false; skal: 'okand' | 'avstangd' | 'avslutat' | 'fel' };

const AVSLUTAD = (s: string | null) => s === 'avslutat' || s === 'klar';

export async function slaUppSkotarLank(sb: Sb, token: string): Promise<LankUtfall> {
  if (!arGiltigtSkotarToken(token)) return { ok: false, skal: 'okand' };
  const l = await sb.from('objekt_skotar_lank').select('objekt_id, aktiv').eq('token', token).maybeSingle();
  if (l.error) return { ok: false, skal: 'fel' };
  if (!l.data) return { ok: false, skal: 'okand' };
  if (!(l.data as { aktiv: boolean }).aktiv) return { ok: false, skal: 'avstangd' };
  const o = await sb.from('objekt').select('id, namn, vo_nummer, status, lat, lng, kartbild_bounds, fastighetsbeteckning, dim_objekt_id, anteckningar').eq('id', (l.data as { objekt_id: string }).objekt_id).maybeSingle();
  if (o.error) return { ok: false, skal: 'fel' };
  if (!o.data) return { ok: false, skal: 'okand' };
  const objekt = o.data as ObjektRad;
  if (AVSLUTAD(objekt.status)) return { ok: false, skal: 'avslutat' };
  return { ok: true, objekt };
}

/** Okänd token = 404 utan förklaring (en gissad token ska inte lära sig något). */
export function lankFelSvar(u: Extract<LankUtfall, { ok: false }>): Svar {
  if (u.skal === 'okand') return FEL(404, 'Länken finns inte');
  if (u.skal === 'avstangd') return FEL(410, 'Länken är avstängd');
  if (u.skal === 'avslutat') return FEL(410, 'Trakten är klar');
  return FEL(503, 'Kunde inte läsa just nu');
}

// ---- Cache (best effort, per serverinstans) -------------------------------------------------------------------------------------------------

const cache = new Map<string, { ts: number; v: unknown }>();
async function cachad<T>(nyckel: string, ttlMs: number, f: () => Promise<T>, nu = Date.now()): Promise<T> {
  const e = cache.get(nyckel);
  if (e && nu - e.ts < ttlMs) return e.v as T;
  const v = await f();
  cache.set(nyckel, { ts: nu, v });
  if (cache.size > 200) for (const k of Array.from(cache.keys()).slice(0, 50)) cache.delete(k);
  return v;
}
export const rensaSkotarCache = () => cache.clear();
/** Efter en markering: nästa läsning av objektets karta räknas om (annars visar den högen som kvar i två minuter). */
export const glomSkotarVy = (objektId: string) => { cache.delete(`vy:${objektId}`); };

/** Är länken giltig? Kort cache (60 s) så att en karta med tjugo rutor inte gör tjugo uppslag. */
export async function skotarLankGiltig(sb: Sb, token: string, nu = Date.now()): Promise<boolean> {
  if (!arGiltigtSkotarToken(token)) return false;
  return cachad(`giltig:${token}`, 60000, async () => (await slaUppSkotarLank(sb, token)).ok, nu);
}

// ---- Vitlistorna ----------------------------------------------------------------------------------------------------------------------------

/** Fälten i en markering som får lämna servern. Allt annat (vem som tog fotot, interna anteckningar, framtida fält) stannar. Fotot skickas som `foto: true` och hämtas via /foto. */
export const MARKERING_FALT = [
  'id', 'x', 'y', 'path', 'comment', 'isMarker', 'type', 'isLine', 'lineType', 'isArrow', 'arrowType', 'rotation', 'angle', 'isZone', 'zoneType',
  'nummer', 'avlaggNummer', 'antal', 'farg', 'backvag', 'vagId', 'lat', 'lng', 'lat2', 'lng2', 'risaPath',
] as const;

export function rensaMarkering(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const ut: Record<string, unknown> = {};
  for (const k of MARKERING_FALT) if (d[k] !== undefined) ut[k] = d[k];
  if (typeof d.photoPath === 'string' && d.photoPath) ut.foto = true;
  else if (typeof d.photoData === 'string' && d.photoData.startsWith('data:image/')) ut.foto = true;
  return ut;
}

/** Vidas egenskaper som får lämna servern (ritning och kortets text). */
const VIDA_FALT = ['_typ', '_lager', '_farg', 'FLBESKR', 'LOPNR', 'TYP', 'EXTRA_LABE', 'ATGARD'] as const;
const VIDA_LAGER_OK = new Set(['SV_SKS_NYCKELBIOTOP_101', 'L_RAA_POLY_101', 'L_RAA_LINE_101', 'L_RAA_POINT_101']);

/** Vidas features som sidan ritar: linjer (basväg, kraftledning), hänsynsytor, avlägg (inte larmpunkten), nyckelbiotoper och fornlämningar. */
export function rensaVida(features: readonly unknown[]): { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }[] {
  const ut: { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }[] = [];
  for (const f of features as { geometry?: unknown; properties?: Record<string, unknown> | null }[]) {
    const p = f?.properties ?? {};
    const typ = String(p._typ ?? ''), lager = String(p._lager ?? ''), beskr = String(p.FLBESKR ?? '').toLowerCase();
    const ok = typ === 'linje' || typ === 'hänsynsyta' || (typ === 'punkt' && !beskr.includes('larm')) || VIDA_LAGER_OK.has(lager);
    if (!ok || !f.geometry) continue;
    const props: Record<string, unknown> = {};
    for (const k of VIDA_FALT) if (p[k] != null) props[k] = p[k];
    ut.push({ type: 'Feature', geometry: f.geometry, properties: props });
  }
  return ut;
}

// ---- Läsningen ------------------------------------------------------------------------------------------------------------------------------

export type SkotarVy = {
  namn: string;
  mitt: { lat: number; lng: number } | null;
  gran: LngLat[][];
  spar: LngLat[][];
  hogar: HogarSvar | null;
  origo: Origo | null;
  /** Varför planerarens markeringar inte syns (null = de syns, eller det finns inga). */
  origoText: string | null;
  markeringar: Record<string, unknown>[];
  /** Kommentarernas text per markering (id), äldst först. Aldrig vem som skrev. */
  kommentarer: Record<string, string[]>;
  vida: ReturnType<typeof rensaVida>;
  /** Om trakten: Vidas traktdirektiv och kommentarerna på själva trakten (text, aldrig vem). */
  omTrakten: { direktiv: string | null; kommentarer: string[] };
  /** Avläggen (hans egna, planerarens, Vidas) med det han rapporterat dit. null = lassen eller avläggen gick inte att läsa. */
  avlagg: Avlagg[] | null;
  /** Sortimenten att välja i lasskortet (skördarens på trakten, störst först), med namnet i klartext. */
  sortiment: { namn: string; visning: string }[];
  /** Det som inte gick att läsa, i ord. */
  fel: string[];
};

/** Andel av markeringarnas punkter som ska ligga inom skördarens område (stammar + körspår) plus ORIGO_MARGINAL_M. */
export const ORIGO_ANDEL_INOM = 0.8;
export const ORIGO_MARGINAL_M = 300;

/**
 * Origot för en trakt UTAN Vida-gräns: objektets punkt (som planeringsvyn), om markeringarna ligger där skördaren arbetat.
 * `ref` = stammarna och körspåret ([lng, lat]). Tom ref = inget att pröva mot → objektets punkt, som planeringsvyn. null = rita inte.
 */
export function origoUtanVida(objekt: { lat: number | null; lng: number | null; kartbild_bounds: unknown }, punkter: { x: number; y: number }[], ref: LngLat[]): Origo | null {
  const origo = objektStartKamera(objekt);
  if (!origo) return null;
  if (ref.length === 0 || punkter.length === 0) return origo;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [x, y] of ref) { if (x < minLng) minLng = x; if (x > maxLng) maxLng = x; if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; }
  const dLat = ORIGO_MARGINAL_M / 111_320;
  const dLng = ORIGO_MARGINAL_M / (111_320 * Math.cos((origo.lat * Math.PI) / 180));
  let inom = 0;
  for (const p of punkter) {
    const ll = svgToLatLon(p.x, p.y, origo);
    if (ll.lng >= minLng - dLng && ll.lng <= maxLng + dLng && ll.lat >= minLat - dLat && ll.lat <= maxLat + dLat) inom++;
  }
  return inom / punkter.length >= ORIGO_ANDEL_INOM ? origo : null;
}

const ORIGO_TEXT = 'Planerarens markeringar visas inte: de går inte att placera säkert på kartan.';

/**
 * Egenkontrollens svaga kontroll räknar PUNKTER: en GPS-spårad basväg på 1,2 km ut till allmän väg (Bondeskog AU 2026, ~90 punkter)
 * väger då tyngre än alla symboler i trakten, och en rätt placerad trakt underkänns. Här räknas varje MARKERING en gång: den räknas
 * som på plats när någon av dess punkter ligger inom Vidas ruta + samma marginal. En felplacering (hela trakten förskjuten, PR 278/322)
 * flyttar alla markeringar åt samma håll och fångas fortfarande. Gäller bara när planeraren inte ritat någon traktgräns
 * (då har den starka kontrollen redan sagt nej) och bara skotarsidan — egenkontrollen är orörd.
 */
export function origoPerMarkering(objekt: { lat: number | null; lng: number | null; kartbild_bounds: unknown }, rader: { data?: unknown }[], vida: VidaGrans): Origo | null {
  if (vida.typ !== 'ok') return null;
  const origo = objektStartKamera(objekt);
  if (!origo) return null;
  const [[vMinLng, vMinLat], [vMaxLng, vMaxLat]] = vida.gran;
  const mLng = 111_320 * Math.cos((origo.lat * Math.PI) / 180);
  const marginalM = Math.max(KVITTO.MARGINAL_MIN_M, KVITTO.MARGINAL_ANDEL * Math.max((vMaxLng - vMinLng) * mLng, (vMaxLat - vMinLat) * 111_320));
  const dLng = marginalM / mLng;
  const dLat = marginalM / 111_320;
  let antal = 0;
  let inom = 0;
  for (const r of rader) {
    const p = markeringsPunkter([r]);
    if (p.length === 0) continue;
    antal++;
    if (p.some((q) => { const ll = svgToLatLon(q.x, q.y, origo); return ll.lng >= vMinLng - dLng && ll.lng <= vMaxLng + dLng && ll.lat >= vMinLat - dLat && ll.lat <= vMaxLat + dLat; })) inom++;
  }
  return antal > 0 && inom / antal >= KVITTO.ANDEL_INOM ? origo : null;
}

/** Sortimentens klartextnamn (grupp och destination ur vy_sortiment_klass), läst högst en gång i timmen per serverinstans. Ett läsfel = namnen tolkas ur texten. */
async function lasSortimentKlassServer(sb: Sb): Promise<void> {
  await cachad('sortiment-klass', 3600_000, async () => {
    const r = await hamtaAlla<{ sortiment_id: string; namn: string | null; grupp: string | null; destination: string | null }>(
      () => sb.from('vy_sortiment_klass').select('sortiment_id, namn, grupp, destination') as never, 'sortiment_id');
    if (!r.error && r.data.length) sattSortimentKlass(r.data);
    return true;
  }).catch(() => undefined);
}

/** Numren objektets stammar ligger under (VO-nummer, extra nummer och skördarens maskinobjekt). */
export async function objektStamIds(sb: Sb, o: ObjektRad): Promise<string[]> {
  const alt = await hamtaAltNummer(sb, o.id).catch(() => []);
  return Array.from(new Set([...(o.vo_nummer ? hogarObjektIds(o.vo_nummer, alt) : []), ...(o.dim_objekt_id ? [o.dim_objekt_id] : [])]));
}

export async function lasSkotarVy(sb: Sb, o: ObjektRad): Promise<SkotarVy> {
  const fel: string[] = [];
  const ids = await objektStamIds(sb, o);

  const [markSvar, vida, sparSvar, stamSvar, tsSvar, kommSvar, uttagSvar, lassSvar, hogMarkSvar, egnaAvlaggSvar, lankLassSvar] = await Promise.all([
    sb.from('planering_markeringar').select('data').eq('objekt_id', o.id),
    lasVidaGrans(sb, o.id).catch((e: unknown): VidaGrans => ({ typ: 'fel', meddelande: String(e) })),
    sb.from('hyttspar').select('points').eq('objekt_id', o.id).eq('roll', 'skordare').order('datum', { ascending: true }).order('id', { ascending: true }),
    ids.length
      ? hamtaAlla<{ latitude: number; longitude: number; total_volym: number | null; tradslag_id: string | null; sortiment: string | null }>(
        () => sb.from('detalj_stam').select('latitude, longitude, total_volym, tradslag_id, sortiment').in('objekt_id', ids).not('latitude', 'is', null) as never, 'id')
      : Promise.resolve({ data: [], error: null }),
    sb.from('dim_tradslag').select('tradslag_id, namn'),
    sb.from('kartkommentar').select('yta_nyckel, text, skapad_at').eq('objekt_id', o.id),
    sb.from('skotning_uttag').select('tradslag, volym, polygon_coords').eq('objekt_id', o.id),
    hamtaAlla<unknown>(() => sb.from('skotar_lass').select(LASS_SELECT).eq('objekt_id', o.id) as never, 'id'),
    sb.from('skotar_hog_markering').select('id, typ, geometri, bredd_m, grupp, skapad_at').eq('objekt_id', o.id).order('skapad_at'),
    sb.from('skotar_lank_avlagg').select('id, nummer, lat, lng, borttagen').eq('objekt_id', o.id),
    sb.from('skotar_lank_lass').select('id, avlagg, sortiment, struken, skapad_at').eq('objekt_id', o.id),
    lasSortimentKlassServer(sb),
  ]);

  // Traktgränsen + Vidas lager
  let gran: LngLat[][] = [];
  let vidaFeatures: unknown[] = [];
  if (vida.typ === 'ok') gran = (vida.ringar ?? []) as LngLat[][];
  else if (vida.typ === 'fel') fel.push('traktgränsen');
  const geo = await sb.from('objekt_geometri').select('geometri').eq('objekt_id', o.id);
  if (geo.error) fel.push('Vidas lager');
  else vidaFeatures = ((geo.data ?? []) as { geometri?: { features?: unknown[] } | null }[]).flatMap((r) => (Array.isArray(r?.geometri?.features) ? r.geometri!.features! : []));

  // Planerarens markeringar + origot (samma regel som objektöversikten och egenkontrollen: hellre inga än på fel plats)
  let markeringar: Record<string, unknown>[] = [];
  let origo: Origo | null = null;
  let origoText: string | null = null;
  if (markSvar.error) fel.push('planerarens markeringar');
  else {
    const rader = (markSvar.data ?? []) as { data: unknown }[];
    if (rader.length > 0) {
      const objekt = { lat: o.lat, lng: o.lng, kartbild_bounds: o.kartbild_bounds };
      const punkter = markeringsPunkter(rader);
      const beslut = beslutaOrigo({ objekt, punkter, granser: markeringsGranser(rader), vida });
      if (beslut.ok) origo = beslut.origo;
      else if (beslut.skal === 'ingen_vida_grans') {
        // Egna trakter (Starta jobb, manuella) har ingen Vida-gräns att pröva mot. Planeringsvyn ritar dem ändå mot objektets punkt — det gör vi också,
        // men bara om markeringarna ligger där skördaren faktiskt arbetat (stammarna och körspåret). Inget att jämföra med = som planeringsvyn.
        const ref: LngLat[] = [
          ...(stamSvar.error ? [] : stamSvar.data.map((x) => [x.longitude, x.latitude] as LngLat)),
          ...(sparSvar.error ? [] : ((sparSvar.data ?? []) as { points: unknown }[]).flatMap((r) => (Array.isArray(r.points) ? (r.points as { lat?: unknown; lng?: unknown }[]) : []))
            .filter((q) => typeof q?.lat === 'number' && typeof q?.lng === 'number').map((q) => [q.lng as number, q.lat as number] as LngLat)),
        ];
        origo = origoUtanVida(objekt, punkter, ref);
      } else if (beslut.skal === 'stammer_inte' && markeringsGranser(rader).length === 0) {
        origo = origoPerMarkering(objekt, rader, vida);
      }
      if (origo) markeringar = rader.map((r) => rensaMarkering(r.data)).filter((x): x is Record<string, unknown> => !!x);
      else origoText = ORIGO_TEXT;
    }
  }

  // Kommentarerna: bara texten, per markering.
  const kommentarer: Record<string, string[]> = {};
  if (!kommSvar.error) {
    const idn = new Map(markeringar.filter((m) => m.id != null).map((m) => [markerNyckel(String(m.id)), String(m.id)]));
    for (const r of [...((kommSvar.data ?? []) as { yta_nyckel: string; text: string | null; skapad_at: string }[])].sort((a, b) => String(a.skapad_at).localeCompare(String(b.skapad_at)))) {
      const id = idn.get(String(r.yta_nyckel));
      const t = String(r.text ?? '').trim();
      if (id && t) (kommentarer[id] ??= []).push(t);
    }
  }

  // Skördarens körspår: utjämnat och ihopslaget till stråk (samma ritning som planeringen och objektöversikten). Inga tider lämnar servern.
  let spar: LngLat[][] = [];
  if (sparSvar.error) fel.push('körspåren');
  else {
    const linjer: LngLat[][] = [];
    for (const rad of (sparSvar.data ?? []) as { points: unknown }[]) {
      if (!Array.isArray(rad.points)) continue;
      const punkter = (rad.points as { lat?: unknown; lng?: unknown; tid?: unknown }[])
        .filter((p) => typeof p?.lat === 'number' && typeof p?.lng === 'number')
        .map((p) => ({ lat: p.lat as number, lng: p.lng as number, tid: typeof p.tid === 'string' ? p.tid : '' }));
      for (const l of hyttsparRitadeLinjer(punkter)) linjer.push(l as LngLat[]);
    }
    spar = byggStrak(linjer, 'skordare') as LngLat[][];
  }

  // Produktionshögarna. Går stammarna inte att läsa finns inga högar; går uttag, lass eller markeringar inte att läsa sägs det (högarna visas då som skördade).
  let hogar: HogarSvar | null = null;
  let sortimentNamn: string[] = [];
  if (stamSvar.error) fel.push('produktionshögarna');
  else {
    const tsNamn = new Map(((tsSvar.data ?? []) as { tradslag_id: string; namn: string }[]).map((r) => [String(r.tradslag_id), r.namn]));
    const stammar: Stam[] = stamSvar.data
      .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => ({ lat: s.latitude, lng: s.longitude, volym: Number(s.total_volym) || 0, tradslag: tsNamn.get(String(s.tradslag_id)) ?? '', sortiment: s.sortiment }));
    sortimentNamn = lassSortiment(stammar);
    const lass: Lass[] = lassSvar.error ? [] : (lassSvar.data as unknown[]).map(lassFranServer).filter((l): l is Lass => !!l);
    const hogMark: HogMarkering[] = hogMarkSvar.error ? [] : ((hogMarkSvar.data ?? []) as Record<string, unknown>[]).map(lasMarkeringRad).filter((m): m is HogMarkering => !!m);
    if (uttagSvar.error || lassSvar.error) fel.push('det som redan skotats');
    try {
      hogar = stammar.length ? skotarHogar(stammar, (uttagSvar.error ? [] : uttagSvar.data ?? []) as never, lass, hogMark, sortimentVisning) : null;
    } catch { fel.push('produktionshögarna'); }
  }

  // Avläggen och hans lass (egna tabeller — räknas aldrig som vår skotning).
  let avlagg: Avlagg[] | null = null;
  const vidaRen = rensaVida(vidaFeatures);
  if (egnaAvlaggSvar.error || lankLassSvar.error) fel.push('avläggen');
  else avlagg = byggAvlagg({ egna: (egnaAvlaggSvar.data ?? []) as EgetAvlaggRad[], markeringar, origo, vida: vidaRen as never, lass: (lankLassSvar.data ?? []) as LassRad[] });

  const direktiv = typeof o.anteckningar === 'string' && o.anteckningar.trim() ? o.anteckningar.trim() : null;
  // Kommentarerna på själva trakten (traktdelar och egna områden), äldst först.
  const traktKommentarer = kommSvar.error ? [] : [...((kommSvar.data ?? []) as { yta_nyckel: string; text: string | null; skapad_at: string }[])]
    .filter((r) => /^(traktdel|omrade):/.test(String(r.yta_nyckel)))
    .sort((a, b) => String(a.skapad_at).localeCompare(String(b.skapad_at)))
    .map((r) => String(r.text ?? '').trim()).filter(Boolean);

  return {
    namn: besokNamn(o.namn, o.vo_nummer, o.fastighetsbeteckning),
    omTrakten: { direktiv, kommentarer: traktKommentarer },
    mitt: o.lat != null && o.lng != null ? { lat: o.lat, lng: o.lng } : null,
    avlagg, sortiment: sortimentNamn.map((namn) => ({ namn, visning: sortimentVisning(namn) || namn })),
    gran, spar, hogar, origo, origoText, markeringar, kommentarer, vida: vidaRen, fel,
  };
}

// ---- GET /api/skotare/<token> ---------------------------------------------------------------------------------------------------------------

/** Objektets vy, cachad i två minuter (rensas efter varje skrivning, glomSkotarVy). */
export const cachadSkotarVy = (sb: Sb, o: ObjektRad, nu = Date.now()) => cachad(`vy:${o.id}`, 2 * 60000, () => lasSkotarVy(sb, o), nu);

/**
 * `farsk` = läs om, förbi cachen. Används direkt efter en skrivning: på Vercel kan skrivningen och nästa läsning hamna på olika serverinstanser,
 * så att rensa cachen där skrivningen gjordes räcker inte (avläggen syntes inte förrän cachen gått ut, 2026-11-06).
 */
export async function skotarVySvar(sb: Sb, token: string, nu = Date.now(), farsk = false): Promise<Svar> {
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return lankFelSvar(u);
  if (farsk) glomSkotarVy(u.objekt.id);
  const vy = await cachadSkotarVy(sb, u.objekt, nu);
  return { status: 200, body: { ok: true, ...vy, uppdaterad: new Date(nu).toISOString() } };
}

// ---- GET /api/skotare/<token>/foto?id=<markering> --------------------------------------------------------------------------------------------

export type FotoUtfall = { typ: 'url'; url: string } | { typ: 'data'; mime: string; bytes: Uint8Array } | { typ: 'fel'; status: number };

/** Fotot på EN markering i länkens objekt. Markeringen måste höra till objektet — aldrig en sökväg från klienten. */
export async function skotarFoto(sb: Sb, token: string, markeringId: string | null, bucket: string = MARKERING_FOTO_BUCKET): Promise<FotoUtfall> {
  if (!markeringId || !/^[A-Za-z0-9_.:-]{1,80}$/.test(markeringId)) return { typ: 'fel', status: 400 };
  const u = await slaUppSkotarLank(sb, token);
  if (!u.ok) return { typ: 'fel', status: u.skal === 'okand' ? 404 : u.skal === 'fel' ? 503 : 410 };
  const m = await sb.from('planering_markeringar').select('data').eq('objekt_id', u.objekt.id);
  if (m.error) return { typ: 'fel', status: 503 };
  const rad = ((m.data ?? []) as { data: Record<string, unknown> | null }[]).find((r) => r.data && String(r.data.id) === markeringId);
  const d = rad?.data;
  if (!d) return { typ: 'fel', status: 404 };
  if (typeof d.photoPath === 'string' && d.photoPath) {
    const s = await sb.storage.from(bucket).createSignedUrl(d.photoPath, 600);
    if (s.error || !s.data?.signedUrl) return { typ: 'fel', status: 503 };
    return { typ: 'url', url: s.data.signedUrl };
  }
  const data = typeof d.photoData === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(d.photoData) : null;
  if (data) return { typ: 'data', mime: data[1], bytes: Uint8Array.from(Buffer.from(data[2], 'base64')) };
  return { typ: 'fel', status: 404 };
}
