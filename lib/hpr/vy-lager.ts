/**
 * vy-lager.ts — apteringsvyn räknad i förväg (2026-10-21).
 *
 * Förut räknade /api/fordelning om ALLA objekt ur logs vid varje öppning
 * (47 objekt, ~512 000 stockar) och slog i statement timeout. Nu räknas ett
 * objekts vymodell när dess HPR-fil importeras och sparas i `fordelning_vy`;
 * vyn läser bara färdiga rader (Apple/Tesla-principen: räkna när datan kommer,
 * inte när någon tittar).
 *
 * Siffrorna är fortfarande byggObjektVy ur logs/matrix_cells — tabellen är en
 * lagrad beräkning, aldrig en egen källa. En rad är aktuell när den räknats på
 * samma `last_file_at` som objektet har nu OCH med samma VY_VERSION. Ändras
 * beräkningen i vy.ts/fordelning.ts: höj VY_VERSION, så räknas allt om.
 *
 * Det som ändras utan ny fil (status, namn, dagar sedan fil) läses alltid
 * levande ur harvest_objects (`medLevandeMeta`) och lagras aldrig som sanning.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hamtaObjektData, type ObjektData } from "./objekt-data";
import { byggObjektVy, type ObjektVy, type Snapshot } from "./vy";
import { gruppFor, slaIhopData, traktGrupper, traktMeta } from "./sammaTrakt";

/** Höj när beräkningen i vy.ts/fordelning.ts ändras — då räknas alla rader om. */
export const VY_VERSION = 3; // 2: m³ för översikten · 3: bedömt på maskinens egna kap (utanforM3)

/** Objektkortet = vymodellen utan produkternas detaljer (vältor, matris …). */
export type ObjektKort = Omit<ObjektVy, "produkter">;

export interface ObjektMeta {
  object_key: string;
  object_name: string | null;
  status: "active" | "completed";
  last_file_at: string | null;
}

export interface LagradRad {
  object_key: string;
  last_file_at: string | null;
  version: number;
  kort: ObjektKort | null;
}

/** Samma tidpunkt? Jämför som tid (DB och klient kan skriva olika format). */
export function sammaTid(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a == b;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  return ta === tb;
}

/** Är den lagrade raden räknad på objektets nuvarande fil och version? */
export function arAktuell(rad: Pick<LagradRad, "last_file_at" | "version"> | undefined, lastFileAt: string | null): boolean {
  return !!rad && rad.version === VY_VERSION && sammaTid(rad.last_file_at, lastFileAt);
}

/**
 * Är raden räknad på exakt de här delarna? En trakt som fått en del till (eller
 * en rad räknad innan ihopslagningen fanns) är inaktuell. En rad utan kort
 * (inga fördelningsmål) bär inga delar och bedöms bara på tiden.
 */
export function delarStammer(rad: Pick<LagradRad, "kort"> | undefined, grupp: string[]): boolean {
  if (!rad?.kort) return true;
  const lagrade = rad.kort.delar ?? [rad.kort.objectKey];
  return lagrade.length === grupp.length && lagrade.every((k, i) => k === grupp[i]);
}

/**
 * Läs trakten ett objekt hör till: alla objekt med samma namn (maskinen och
 * tiden avgör sammaTrakt), gruppen och dess levande meta. Kastar vid läsfel;
 * null = objektet finns inte.
 */
export async function lasTrakt(
  supabase: SupabaseClient,
  objectKey: string
): Promise<{ grupp: string[]; delar: ObjektMeta[]; meta: ObjektMeta } | null> {
  const { data: eget, error: egetErr } = await supabase
    .from("harvest_objects")
    .select("object_key,object_name,status,last_file_at")
    .eq("object_key", objectKey)
    .maybeSingle();
  if (egetErr) throw new Error(`harvest_objects: ${egetErr.message}`);
  if (!eget) return null;
  let kandidater: ObjektMeta[] = [eget as ObjektMeta];
  if (eget.object_name) {
    const { data, error } = await supabase
      .from("harvest_objects")
      .select("object_key,object_name,status,last_file_at")
      .eq("object_name", eget.object_name);
    if (error) throw new Error(`harvest_objects: ${error.message}`);
    kandidater = (data ?? []) as ObjektMeta[];
    if (!kandidater.some((k) => k.object_key === objectKey)) kandidater.push(eget as ObjektMeta);
  }
  const grupp = gruppFor(objectKey, kandidater);
  const delar = kandidater.filter((k) => grupp.includes(k.object_key));
  return { grupp, delar, meta: traktMeta(delar) };
}

export function tillKort(vy: ObjektVy): ObjektKort {
  const { produkter: _p, ...kort } = vy;
  return kort;
}

/** Lägg levande meta (status, namn, dagar sedan fil) över en lagrad vy. */
export function medLevandeMeta<T extends ObjektKort>(lagrad: T, meta: ObjektMeta, nu: Date): T {
  const dagarSedanFil = meta.last_file_at
    ? Math.floor((nu.getTime() - new Date(meta.last_file_at).getTime()) / 86400000)
    : null;
  return {
    ...lagrad,
    objektNamn: meta.object_name,
    status: meta.status,
    lastFileAt: meta.last_file_at,
    dagarSedanFil,
  };
}

/**
 * Räkna trakten objektet hör till ur databasen och spara den under traktens
 * huvudnyckel (ett ensamt objekt = sig självt). `data` skickas med av
 * importen, som redan har objektets stockar i minnet. Returnerar vyn
 * (null = trakten har inga fördelningsmål). Kastar vid läs- eller skrivfel.
 */
export async function raknaOchSparaVy(
  supabase: SupabaseClient,
  objectKey: string,
  data?: ObjektData
): Promise<ObjektVy | null> {
  const trakt = await lasTrakt(supabase, objectKey);
  if (!trakt) throw new Error(`Objektet ${objectKey} finns inte`);
  const { grupp, meta } = trakt;
  const huvud = grupp[0];

  // Trendpilen jämför ett objekts egna snapshots; för en ihopslagen trakt
  // finns ingen sådan serie, så ingen trend hellre än en blandad.
  let snaps: Snapshot[] = [];
  if (grupp.length === 1) {
    const { data: s, error: snapErr } = await supabase
      .from("distribution_snapshots")
      .select("object_key,product_key,computed_at,grade_total_pct")
      .eq("object_key", huvud);
    if (snapErr) throw new Error(`distribution_snapshots: ${snapErr.message}`);
    snaps = (s ?? []) as Snapshot[];
  }

  const delData: ObjektData[] = [];
  for (const k of grupp) {
    delData.push(data && data.objectKey === k ? data : await hamtaObjektData(supabase, k));
  }
  const objektData = grupp.length === 1 ? delData[0] : slaIhopData(huvud, delData);
  const vy = byggObjektVy(
    objektData,
    { objektNamn: meta.object_name, status: meta.status, lastFileAt: meta.last_file_at },
    snaps,
    new Date()
  );
  if (vy && grupp.length > 1) vy.delar = grupp;

  const { error: skrivErr } = await supabase.from("fordelning_vy").upsert(
    {
      object_key: huvud,
      last_file_at: meta.last_file_at,
      version: VY_VERSION,
      computed_at: new Date().toISOString(),
      kort: vy ? tillKort(vy) : null,
      vy,
    },
    { onConflict: "object_key" }
  );
  if (skrivErr) throw new Error(`fordelning_vy: ${skrivErr.message}`);
  return vy;
}

export interface Lista {
  /** Kort att visa; `uppdateras` = siffrorna är från förra filen, ny räknas. */
  objekt: (ObjektKort & { uppdateras: boolean })[];
  /** Objekt som aldrig räknats — visas med namn och "Räknas…". */
  vantar: { objectKey: string; objektNamn: string | null; status: "active" | "completed" }[];
  /** Objekt som behöver räknas om (aldrig räknade + inaktuella). */
  inaktuella: string[];
}

/**
 * Bygg listan ur lagrade rader. Ren funktion — ingen databas. Objekt utan
 * fördelningsmål (`medMal`) och aktuella rader utan kort hoppas över.
 */
export function byggLista(
  objekt: ObjektMeta[],
  medMal: Set<string>,
  lagrade: LagradRad[],
  nu: Date
): Lista {
  const perNyckel = new Map(lagrade.map((r) => [r.object_key, r]));
  const perObjekt = new Map(objekt.map((o) => [o.object_key, o]));
  const ut: Lista = { objekt: [], vantar: [], inaktuella: [] };
  const aktiv = new Set<string>();

  // En trakt kan bestå av flera objekt (lib/hpr/sammaTrakt) — den visas EN gång,
  // under huvudnyckeln, och räknas om som en.
  for (const grupp of traktGrupper(objekt)) {
    if (!grupp.some((k) => medMal.has(k))) continue;
    const o = traktMeta(grupp.map((k) => perObjekt.get(k)!));
    if (o.status === "active") aktiv.add(o.object_key);
    const rad = perNyckel.get(o.object_key);
    const aktuell = arAktuell(rad, o.last_file_at) && delarStammer(rad, grupp);
    if (!aktuell) ut.inaktuella.push(o.object_key);

    if (rad?.kort) {
      ut.objekt.push({ ...medLevandeMeta(rad.kort, o, nu), uppdateras: !aktuell });
    } else if (!aktuell) {
      ut.vantar.push({ objectKey: o.object_key, objektNamn: o.object_name, status: o.status });
    }
    // aktuell rad utan kort = inga fördelningsmål på produkterna: visas inte.
  }

  // Läge 2 först (behöver uppmärksamhet), sedan störst volym — som förut.
  ut.objekt.sort((a, b) => (b.lage - a.lage) || (b.volymM3 - a.volymM3));
  // Aktiva objekt räknas först: de är dem man tittar på.
  ut.inaktuella.sort((a, b) => Number(aktiv.has(b)) - Number(aktiv.has(a)));
  return ut;
}

/** Läs allt listan behöver: objekt, vilka som har mål, och lagrade rader. */
export async function lasLista(supabase: SupabaseClient, nu: Date): Promise<Lista> {
  const [obj, mal, lagr] = await Promise.all([
    supabase.from("harvest_objects").select("object_key,object_name,status,last_file_at"),
    supabase.from("products").select("object_key").eq("distribution_allowed", true),
    supabase.from("fordelning_vy").select("object_key,last_file_at,version,kort"),
  ]);
  if (obj.error) throw new Error(`harvest_objects: ${obj.error.message}`);
  if (mal.error) throw new Error(`products: ${mal.error.message}`);
  if (lagr.error) throw new Error(`fordelning_vy: ${lagr.error.message}`);
  return byggLista(
    (obj.data ?? []) as ObjektMeta[],
    new Set((mal.data ?? []).map((p) => p.object_key as string)),
    (lagr.data ?? []) as LagradRad[],
    nu
  );
}
