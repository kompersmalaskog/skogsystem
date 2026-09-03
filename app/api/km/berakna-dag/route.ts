import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { beraknaOchPersisteraDagKm, hamtaObjektKoordinater, ObjektKoord } from "@/lib/routing";
import { målMedarbetareId } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/km/berakna-dag  { medarbetare_id, datum }
 *
 * HUVUDVÄGEN: anropas när en dag ÖPPNAS (redigera-vyn + idag-kvällsvyn), så km
 * finns persisterad redan när föraren ska bekräfta — inte "dagen efter när någon
 * öppnar kalendern". Räknar + persisterar via den DELADE helpern (samma vakt och
 * kodväg som nattjobbet och km-summary), så alla tre alltid ger samma värde. Tar
 * samtidigt bort den fjärde divergerande beräkningsvägen (idag-kvällens direkta
 * /api/routing utan koordinat-fallbackkedja).
 *
 * Best-effort: fel returneras men får ALDRIG blockera bekräftelsen (anropas
 * fire-and-forget från öppningen; bekräftelseknappen beror inte på svaret).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Skriver km på en arbetsdag — id ur sessionen, aldrig ur bodyn (var öppen:
    // vem som helst kunde räkna om vem som helsts dag).
    const mål = await målMedarbetareId(body.medarbetare_id);
    if (!mål.ok) return mål.res;
    const medarbetare_id = mål.id;
    const datum: string | undefined = body.datum;
    if (!datum || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      return NextResponse.json({ ok: false, error: "datum (YYYY-MM-DD) krävs" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: rad, error: radErr } = await supabase
      .from("arbetsdag")
      .select("id, medarbetare_id, datum, objekt_id, km_morgon, km_kvall, km_totalt, redigerad, km_kalla")
      .eq("medarbetare_id", medarbetare_id).eq("datum", datum)
      .maybeSingle();
    if (radErr) return NextResponse.json({ ok: false, error: radErr.message }, { status: 500 });
    if (!rad) return NextResponse.json({ ok: true, status: "hoppad", orsak: "ingen arbetsdag för dagen" });

    const [medRes, aoRes] = await Promise.all([
      supabase.from("medarbetare").select("hem_lat, hem_lng").eq("id", medarbetare_id).maybeSingle(),
      supabase.from("arbetsdag_objekt").select("objekt_id, ordning").eq("arbetsdag_id", rad.id),
    ]);
    const aoRader = ((aoRes.data as any[]) || []).map(r => ({ objekt_id: r.objekt_id, ordning: r.ordning }));
    const objektIds = Array.from(new Set<string>([
      ...(rad.objekt_id ? [String(rad.objekt_id)] : []),
      ...aoRader.filter(r => r.objekt_id).map(r => String(r.objekt_id)),
    ]));
    const koordMap: Record<string, ObjektKoord> = await hamtaObjektKoordinater(supabase, objektIds);

    const res = await beraknaOchPersisteraDagKm(supabase, {
      rad,
      aoRader,
      koordMap,
      hemLat: medRes.data?.hem_lat ?? null, hemLng: medRes.data?.hem_lng ?? null,
      allowOrs: true,
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (e: any) {
    // Best-effort — svara 200 med felinfo så en trasig km-beräkning aldrig
    // presenteras som ett hårt fel i öppningsflödet.
    return NextResponse.json({ ok: false, status: "hoppad", orsak: e?.message || String(e) });
  }
}
