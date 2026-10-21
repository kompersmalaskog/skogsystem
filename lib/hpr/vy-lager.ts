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
 * Räkna objektets vy ur databasen och spara den. `data` skickas med av
 * importen, som redan har objektets stockar i minnet. Returnerar vyn
 * (null = objektet har inga fördelningsmål). Kastar vid läs- eller skrivfel.
 */
export async function raknaOchSparaVy(
  supabase: SupabaseClient,
  objectKey: string,
  data?: ObjektData
): Promise<ObjektVy | null> {
  const { data: meta, error: metaErr } = await supabase
    .from("harvest_objects")
    .select("object_key,object_name,status,last_file_at")
    .eq("object_key", objectKey)
    .maybeSingle();
  if (metaErr) throw new Error(`harvest_objects: ${metaErr.message}`);
  if (!meta) throw new Error(`Objektet ${objectKey} finns inte`);

  const { data: snaps, error: snapErr } = await supabase
    .from("distribution_snapshots")
    .select("object_key,product_key,computed_at,grade_total_pct")
    .eq("object_key", objectKey);
  if (snapErr) throw new Error(`distribution_snapshots: ${snapErr.message}`);

  const objektData = data ?? (await hamtaObjektData(supabase, objectKey));
  const vy = byggObjektVy(
    objektData,
    { objektNamn: meta.object_name, status: meta.status, lastFileAt: meta.last_file_at },
    (snaps ?? []) as Snapshot[],
    new Date()
  );

  const { error: skrivErr } = await supabase.from("fordelning_vy").upsert(
    {
      object_key: objectKey,
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
  const ut: Lista = { objekt: [], vantar: [], inaktuella: [] };

  for (const o of objekt) {
    if (!medMal.has(o.object_key)) continue;
    const rad = perNyckel.get(o.object_key);
    const aktuell = arAktuell(rad, o.last_file_at);
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
  const aktiv = new Set(objekt.filter((o) => o.status === "active").map((o) => o.object_key));
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
