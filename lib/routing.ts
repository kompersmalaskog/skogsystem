import { haversine } from "@/utils/geo";

/**
 * Serverside routing-helpers: cache-lookup → ORS → haversine-fallback.
 * Delas mellan /api/routing, /api/km-summary och /api/km-chain.
 */

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** En route-lookup-begäran mellan två WGS84-punkter. */
export interface RouteRequest {
  fromLat: number; fromLng: number;
  toLat: number;   toLng: number;
}

/** Svar: km + vilken källa datan kom från. */
export interface RouteResult {
  km: number;
  source: "cache" | "ors" | "fallback";
}

/**
 * Slår i route_cache först (koord avrundas till 3 decimaler), sen ORS om
 * nyckel finns och allowOrs=true. Vid miss/ORS-fel: haversine × 1.4.
 * ORS-träff upsertas i cachen. Fallback cachas inte.
 */
export async function routeKm(
  supabase: any,
  req: RouteRequest,
  allowOrs: boolean,
): Promise<RouteResult> {
  const fL = round3(req.fromLat);
  const fLn = round3(req.fromLng);
  const tL = round3(req.toLat);
  const tLn = round3(req.toLng);

  const { data: hit } = await supabase
    .from("route_cache")
    .select("distance_km")
    .eq("from_lat", fL).eq("from_lng", fLn)
    .eq("to_lat", tL).eq("to_lng", tLn)
    .maybeSingle();
  if (hit) return { km: hit.distance_km, source: "cache" };

  const key = process.env.ORS_API_KEY;
  if (allowOrs && key) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${fLn},${fL}&end=${tLn},${tL}`;
      const r = await fetch(url, { headers: { Authorization: key, Accept: "application/geo+json" } });
      if (r.ok) {
        const body: any = await r.json();
        const meters = body?.features?.[0]?.properties?.summary?.distance;
        if (Number.isFinite(meters)) {
          const km = Math.round(meters / 1000);
          await supabase.from("route_cache").upsert(
            { from_lat: fL, from_lng: fLn, to_lat: tL, to_lng: tLn, distance_km: km },
            { onConflict: "from_lat,from_lng,to_lat,to_lng" },
          );
          return { km, source: "ors" };
        }
      } else {
        console.warn("[routing] ORS", r.status, await r.text().catch(() => ""));
      }
    } catch (e: any) {
      console.warn("[routing] ORS-fel", e?.message || String(e));
    }
  }

  return { km: Math.round(haversine(req.fromLat, req.fromLng, req.toLat, req.toLng) * 1.4), source: "fallback" };
}

/**
 * Varifrån en objekt-koordinat kom, i prioritetsordning:
 *  "maskin" = dim_objekt (maskin-GPS, mest precist när det finns)
 *  "objekt" = objekt.lat/lng (planerings-/egen koordinat) via vo_nummer
 *  "larm"   = objekt.larmkoordinat_lat/lng via vo_nummer (sista utväg)
 *  null     = ingen koordinat alls → km går inte att beräkna ("fyll i själv")
 */
export type KoordKalla = "maskin" | "objekt" | "larm" | null;

export interface ObjektKoord {
  lat: number | null;
  lng: number | null;
  kalla: KoordKalla;
  object_name?: string | null;
  skogsagare?: string | null;
  huvudtyp?: string | null;
  // kraver_koordinat = false → platsen är en flytt/service-punkt som inte ska
  // räknas som ett arbetsställe när dagens km bestäms. null/true = vanligt objekt
  // (kräver koordinat). Läses ur dim_objekt; dagensPlatser() filtrerar på den.
  kraver_koordinat?: boolean | null;
}

/**
 * Slår upp koordinat per objekt_id med FALLBACK-kedja: maskin-GPS (dim_objekt)
 * → objektets egen koordinat (objekt.lat/lng) → larmkoordinat, allt via
 * arbetsdag.objekt_id = dim_objekt.objekt_id = objekt.vo_nummer. Tidigare lästes
 * bara dim_objekt, så skotarobjekt utan maskin-GPS gav TYST 0 km trots att
 * objektet hade en koordinat i objekt-tabellen. Returnerar även vilken källa
 * som användes så UI:t kan yta det ("från maskinens position" / "objektets
 * koordinat"). Saknas allt → kalla=null (aldrig tyst 0). objekt-uppslaget
 * begränsas till NUMERISKA vo_nummer (kolumnen är numerisk — icke-numeriska
 * maskin-lokala objekt_id skulle annars ge cast-fel på hela frågan).
 */
export async function hamtaObjektKoordinater(
  supabase: any,
  objektIds: string[],
): Promise<Record<string, ObjektKoord>> {
  const map: Record<string, ObjektKoord> = {};
  const ids = Array.from(new Set(objektIds.filter(Boolean).map(String)));
  if (ids.length === 0) return map;

  const numeriska = ids.filter((id) => /^\d+$/.test(id));
  const [dimRes, objRes] = await Promise.all([
    supabase.from("dim_objekt")
      .select("objekt_id, object_name, skogsagare, huvudtyp, latitude, longitude, kraver_koordinat")
      .in("objekt_id", ids),
    numeriska.length
      ? supabase.from("objekt")
          .select("vo_nummer, lat, lng, larmkoordinat_lat, larmkoordinat_lng")
          .in("vo_nummer", numeriska)
      : Promise.resolve({ data: [] }),
  ]);

  const dimById: Record<string, any> = {};
  for (const d of dimRes.data || []) dimById[String(d.objekt_id)] = d;
  const objByVo: Record<string, any> = {};
  for (const o of objRes.data || []) {
    const k = String(o.vo_nummer);
    // Vid flera objekt-rader per vo_nummer: föredra en med koordinat.
    if (!objByVo[k] || (objByVo[k].lat == null && o.lat != null)) objByVo[k] = o;
  }

  for (const id of ids) {
    const d = dimById[id];
    const o = objByVo[id];
    let lat: number | null = null, lng: number | null = null;
    let kalla: KoordKalla = null;
    if (d && d.latitude != null && d.longitude != null) {
      lat = Number(d.latitude); lng = Number(d.longitude); kalla = "maskin";
    } else if (o && o.lat != null && o.lng != null) {
      lat = Number(o.lat); lng = Number(o.lng); kalla = "objekt";
    } else if (o && o.larmkoordinat_lat != null && o.larmkoordinat_lng != null) {
      lat = Number(o.larmkoordinat_lat); lng = Number(o.larmkoordinat_lng); kalla = "larm";
    }
    map[id] = {
      lat, lng, kalla,
      object_name: d?.object_name ?? null,
      skogsagare: d?.skogsagare ?? null,
      huvudtyp: d?.huvudtyp ?? null,
      kraver_koordinat: d?.kraver_koordinat ?? null,
    };
  }
  return map;
}

/**
 * DEN ENDA modelldefinitionen för "vilka platser en arbetsdag består av, i
 * ordning" (Modell B). Delas av km-chain, km-summary OCH backfillen så att
 * appen och lönen aldrig kan räkna olika — samma mönster som lib/kmErsattning.ts
 * (en mängd, en källa). Innan detta hade km-vyerna sin egen objekt-sekvens
 * (arbetsdag.objekt_id ensam) medan backfillen använde arbetsdag_objekt — samma
 * kolumn hade fått värden ur två modeller utan att någon kunde se skillnaden.
 *
 * Regel:
 *  - Objektlistan = arbetsdag_objekt i `ordning` (flyttdagar har flera rader).
 *  - Saknas rader i arbetsdag_objekt för dagen → fallback till dagens
 *    arbetsdag.objekt_id-sekvens (fallbackSekvens).
 *  - Konsekutiva dubbletter räknas en gång (samma objekt i rad = en plats).
 *  - Filtrera bort platser som (a) saknar koordinat i koordMap, eller (b) har
 *    kraver_koordinat = false (flytt/service — inte ett arbetsställe).
 *
 * Returnerar objekt_id i ordning. Första = morgonens mål (hem→första), sista =
 * kvällens (sista→hem). Tom lista = dagen kan inte platsbestämmas (hör i
 * koordinatlarmet, inte i km-beräkningen). Ren funktion — ingen I/O, så samma
 * anrop kan verifieras rad-för-rad utan DB.
 */
export function dagensPlatser(
  aoRader: { objekt_id: string | null; ordning: number | null }[],
  fallbackSekvens: (string | null | undefined)[],
  koordMap: Record<string, ObjektKoord>,
): string[] {
  // Behåll bara platser med koordinat OCH kraver_koordinat !== false
  return dagensObjektOrdnat(aoRader, fallbackSekvens).filter((oid) => {
    const k = koordMap[oid];
    return !!k && k.lat != null && k.lng != null && k.kraver_koordinat !== false;
  });
}

/**
 * Dagens objekt i ordning, konsekutiv-dedupat men OFILTRERAT (koordinat/kraver
 * bedöms inte). Delas av dagensPlatser() så ordningsregeln bara finns på ETT
 * ställe, och exponeras separat så en vy kan svara på "vad bestod dagen av?"
 * även för objekt som saknar koordinat (t.ex. för ett ärligt "saknar koordinat"-
 * besked i stället för att tyst utelämna dem).
 */
export function dagensObjektOrdnat(
  aoRader: { objekt_id: string | null; ordning: number | null }[],
  fallbackSekvens: (string | null | undefined)[],
): string[] {
  const ordnad = aoRader.length
    ? [...aoRader]
        .sort((a, b) => (a.ordning ?? 0) - (b.ordning ?? 0))
        .map((r) => r.objekt_id)
    : fallbackSekvens;

  const ids = ordnad
    .map((x) => (x == null ? null : String(x)))
    .filter((x): x is string => !!x);

  // Konsekutiv dedup (samma objekt i rad → en plats)
  const unik: string[] = [];
  for (const oid of ids) if (unik[unik.length - 1] !== oid) unik.push(oid);
  return unik;
}

/** Ett segment i en körkedja: från-etikett → till-etikett = X km. */
export interface Segment {
  fromLabel: string;
  toLabel: string;
  km: number;
  source: string;
}

export interface Point {
  lat: number;
  lng: number;
  label: string; // "Hem", "Hössjömåla" etc
}

/**
 * Bygger hela km-kedjan genom en lista av punkter: [hem, obj1, ..., objN, hem].
 * Hoppar över segment där endera punkten saknar koord — loggas men bryter inte
 * kedjan. Max orsBudget ORS-anrop (övriga använder cache eller haversine).
 */
export async function bygKedjaKm(
  supabase: any,
  punkter: (Point | null)[],
  orsBudget: number,
): Promise<{ segments: Segment[]; totalKm: number; orsAnrop: number }> {
  const segments: Segment[] = [];
  let totalKm = 0;
  let orsAnrop = 0;

  for (let i = 0; i < punkter.length - 1; i++) {
    const a = punkter[i];
    const b = punkter[i + 1];
    if (!a || !b) {
      console.warn("[km-chain] hoppar över segment", i, "— punkt saknas", { a, b });
      continue;
    }
    const res = await routeKm(
      supabase,
      { fromLat: a.lat, fromLng: a.lng, toLat: b.lat, toLng: b.lng },
      orsAnrop < orsBudget,
    );
    if (res.source === "ors") orsAnrop++;
    segments.push({ fromLabel: a.label, toLabel: b.label, km: res.km, source: res.source });
    totalKm += res.km;
  }

  return { segments, totalKm, orsAnrop };
}

// ─────────────────────────────────────────────────────────────
// KM-PERSISTENS — delad beräkning + vaktad skrivning. Tre anropspunkter delar
// dessa: km-summary (månadsvyn), nattjobbet (cron) och bekräftelse-öppningen
// (/api/km/berakna-dag). EN modell → app, lön och nattjobb kan aldrig räkna olika.
// ─────────────────────────────────────────────────────────────

/** Ett ben (hem→objekt, enkel väg) längre än så räknas som en trolig FELAKTIG
 *  KOORDINAT och persisteras inte (dagen loggas som hoppad). Skyddsnät mot
 *  felkoordinat — INTE mot bortaarbete: Daniel kör 73 km i snitt, Max har haft
 *  130. Boende på plats (noll km är rätt) skiljs via arbetsdag.km_kalla='forare',
 *  aldrig via avstånd. Gränsen får därför aldrig ligga lägre. */
export const MAX_BEN_KM = 250;

export interface DagKmBerakning {
  km_morgon: number;
  km_kvall: number;
  källa: RouteResult["source"]; // "cache" | "ors" | "fallback"
  orsAnrop: number;
}

/**
 * Beräknar dagens pendlingskm (hem→första objektet + sista→hem) via Modell B
 * (dagensPlatser — enda modelldefinitionen). Ren beräkning: ingen vakt, ingen
 * skrivning. Returnerar null när dagen inte kan platsbestämmas (inget objekt med
 * koordinat) eller hem-koordinat saknas. Delas av km-summary (visning) och
 * persist-helpern så visning och skrivning aldrig räknar olika.
 */
export async function berakaDagKm(
  supabase: any,
  p: {
    aoRader: { objekt_id: string | null; ordning: number | null }[];
    fallbackObjektId: (string | null | undefined)[];
    koordMap: Record<string, ObjektKoord>;
    hemLat: number | null; hemLng: number | null;
    allowOrs: boolean;
  },
): Promise<DagKmBerakning | null> {
  if (p.hemLat == null || p.hemLng == null) return null;
  const platser = dagensPlatser(p.aoRader, p.fallbackObjektId, p.koordMap);
  if (platser.length === 0) return null;
  const first = p.koordMap[platser[0]];
  const last = p.koordMap[platser[platser.length - 1]];
  const hL = Number(p.hemLat), hN = Number(p.hemLng);
  let orsAnrop = 0;
  // Endast pendlingsbenen (hem→första, sista→hem). Aldrig mellan-objekt-körning —
  // den har ingen kolumn och är inte pendling. km_totalt = morgon + kväll.
  const mRes = await routeKm(supabase, { fromLat: hL, fromLng: hN, toLat: Number(first.lat), toLng: Number(first.lng) }, p.allowOrs);
  if (mRes.source === "ors") orsAnrop++;
  const kRes = await routeKm(supabase, { fromLat: Number(last.lat), fromLng: Number(last.lng), toLat: hL, toLng: hN }, p.allowOrs);
  if (kRes.source === "ors") orsAnrop++;
  const källa = (mRes.source === "fallback" || kRes.source === "fallback") ? "fallback" : kRes.source;
  return { km_morgon: mRes.km, km_kvall: kRes.km, källa, orsAnrop };
}

export type PersistResultat =
  | { status: "skrev"; km_morgon: number; km_kvall: number; källa: string }
  | { status: "hoppad"; orsak: string };

/**
 * VAKT + verifierad skrivning av en beräknad dag. Skriver BARA km_morgon/km_kvall
 * + km_kalla='auto', och bara när ALLA håller:
 *   · alla km-fält 0/null (skriver aldrig över befintlig km)
 *   · redigerad = false (föraren äger dagen)
 *   · km_kalla ≠ 'forare' (medveten uppgift, inkl. medveten 0 — oförstörbar)
 *   · källa ≠ fallback (persisterar aldrig en haversine-gissning)
 *   · båda benen ≤ MAX_BEN_KM (trolig felkoordinat annars)
 * Race-skydd i WHERE (km fortfarande 0, km_kalla inte forare) + verifierad via
 * .select() (0 rader = någon hann emellan → hoppad, aldrig tyst "skrev").
 */
export async function persisteraDagKm(
  supabase: any,
  rad: { id: string; km_morgon: any; km_kvall: any; km_totalt: any; redigerad: boolean | null; km_kalla: string | null },
  ber: DagKmBerakning,
): Promise<PersistResultat> {
  const noll = (v: any) => v == null || Number(v) === 0;
  if (!(noll(rad.km_morgon) && noll(rad.km_kvall) && noll(rad.km_totalt))) return { status: "hoppad", orsak: "km redan satt" };
  if (rad.redigerad) return { status: "hoppad", orsak: "redigerad — föraren äger dagen" };
  if (rad.km_kalla === "forare") return { status: "hoppad", orsak: "km_kalla='forare' — medveten uppgift" };
  if (ber.källa === "fallback") return { status: "hoppad", orsak: "ingen vägberäkning (ORS-fel) — persisterar aldrig haversine-gissning" };
  if (ber.km_morgon > MAX_BEN_KM || ber.km_kvall > MAX_BEN_KM) return { status: "hoppad", orsak: `ben > ${MAX_BEN_KM} km (${ber.km_morgon}/${ber.km_kvall}) — trolig felkoordinat` };
  // Vakten (km 0/null, redigerad=false, km_kalla ≠ 'forare') har redan körts på
  // den FÄRSKA raden ovan. En .or()-filter på update+select får supabase-js att
  // bygga en trasig fråga ("column … does not exist"), därför inget DB-WHERE
  // utöver id. VERIFIERAD SKRIVNING: .select() på km-fälten ger PostgREST:s
  // RETURNING = radens tillstånd EFTER uppdateringen. Vi rapporterar 'skrev'
  // ENDAST om (a) en rad kom tillbaka OCH (b) de återlästa värdena faktiskt är
  // det vi skrev. En update som träffar 0 rader ger tom data → 'hoppad', aldrig
  // tyst "skrev". Returnerar de ÅTERLÄSTA värdena, inte de tänkta.
  const { data, error } = await supabase.from("arbetsdag")
    .update({ km_morgon: ber.km_morgon, km_kvall: ber.km_kvall, km_kalla: "auto" })
    .eq("id", rad.id)
    .select("id, km_morgon, km_kvall, km_kalla");
  if (error) return { status: "hoppad", orsak: `skrivfel: ${error.message}` };
  if (!data || data.length === 0) return { status: "hoppad", orsak: "update träffade 0 rader (raden fanns inte)" };
  const w: any = data[0];
  if (Number(w.km_morgon) !== ber.km_morgon || Number(w.km_kvall) !== ber.km_kvall || w.km_kalla !== "auto") {
    return { status: "hoppad", orsak: `återläsning matchar inte skrivningen (db ${w.km_morgon}/${w.km_kvall}/${w.km_kalla})` };
  }
  return { status: "skrev", km_morgon: Number(w.km_morgon), km_kvall: Number(w.km_kvall), källa: ber.källa };
}

/**
 * Beräkna + persistera dagens km i ett svep. Tidig vakt (innan ORS-anrop) på de
 * villkor som inte kräver beräkning, så vi inte bränner ORS på dagar som ändå
 * inte får skrivas. Delas av nattjobbet och bekräftelse-öppningen.
 */
export async function beraknaOchPersisteraDagKm(
  supabase: any,
  p: {
    rad: { id: string; km_morgon: any; km_kvall: any; km_totalt: any; redigerad: boolean | null; km_kalla: string | null; objekt_id: string | null };
    aoRader: { objekt_id: string | null; ordning: number | null }[];
    koordMap: Record<string, ObjektKoord>;
    hemLat: number | null; hemLng: number | null;
    allowOrs: boolean;
  },
): Promise<PersistResultat & { orsAnrop: number }> {
  const noll = (v: any) => v == null || Number(v) === 0;
  if (!(noll(p.rad.km_morgon) && noll(p.rad.km_kvall) && noll(p.rad.km_totalt))) return { status: "hoppad", orsak: "km redan satt", orsAnrop: 0 };
  if (p.rad.redigerad) return { status: "hoppad", orsak: "redigerad — föraren äger dagen", orsAnrop: 0 };
  if (p.rad.km_kalla === "forare") return { status: "hoppad", orsak: "km_kalla='forare' — medveten uppgift", orsAnrop: 0 };
  const ber = await berakaDagKm(supabase, {
    aoRader: p.aoRader, fallbackObjektId: [p.rad.objekt_id], koordMap: p.koordMap,
    hemLat: p.hemLat, hemLng: p.hemLng, allowOrs: p.allowOrs,
  });
  if (!ber) return { status: "hoppad", orsak: p.hemLat == null ? "saknar hemadress-koordinat" : "inget objekt med koordinat", orsAnrop: 0 };
  const res = await persisteraDagKm(supabase, p.rad, ber);
  return { ...res, orsAnrop: ber.orsAnrop };
}
