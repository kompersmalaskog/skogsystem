import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { målMedarbetareId } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * De ENDA fälten Personal-vyn ändrar: hur personen nås. Allt annat (namn, roll, maskin, adress, lön, friskvård)
 * ändras i Admin › Medarbetare. Listan gäller både admin och föraren själv — en förare kan alltså aldrig nå roll,
 * maskin eller lön härifrån, och fält som inte står här ignoreras tyst.
 */
const UPPDATERBARA = ["telefon", "anhorig_namn", "anhorig_telefon", "anhorig_relation"] as const;

/**
 * PATCH /api/personal/[id] — telefon, anhörig och mat. Föraren ändrar SIN EGEN rad (så att anhöriguppgifterna faktiskt
 * blir ifyllda — 2026-11-01 hade 0 av 7 någon), admin vem som helst. En förare som skickar någon annans id får 403
 * (`målMedarbetareId`: aldrig tyst byte till den egna raden).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mal = await målMedarbetareId(id);
  if (!mal.ok) return mal.res;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Ogiltig begäran" }, { status: 400 }); }
  const payload: Record<string, string | null> = {};
  for (const k of UPPDATERBARA) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v != null && typeof v !== "string") return NextResponse.json({ ok: false, error: `${k} måste vara text` }, { status: 400 });
    payload[k] = v == null || v.trim() === "" ? null : v.trim();
  }
  // Mat bor i en egen tabell (medarbetare_mat — kan vara en hälsouppgift, bara personen själv och admin ser den).
  // Tomt = raden tas bort: "inget särskilt" lagras aldrig som en tom rad.
  let mat: string | null | undefined;
  if ("mat" in body) {
    const v = body.mat;
    if (v != null && typeof v !== "string") return NextResponse.json({ ok: false, error: "mat måste vara text" }, { status: 400 });
    mat = v == null || v.trim() === "" ? null : v.trim();
    if (mat && mat.length > 200) return NextResponse.json({ ok: false, error: "Högst 200 tecken" }, { status: 400 });
  }
  if (Object.keys(payload).length === 0 && mat === undefined) return NextResponse.json({ ok: false, error: "Inget att ändra" }, { status: 400 });

  const supabase = supaService();
  let data: any = null;
  if (Object.keys(payload).length > 0) {
    const r = await supabase
      .from("medarbetare")
      .update(payload)
      .eq("id", mal.id)
      .select("id, telefon, anhorig_namn, anhorig_telefon, anhorig_relation")
      .single();
    if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    data = r.data;
  }
  if (mat !== undefined) {
    const r = mat === null
      ? await supabase.from("medarbetare_mat").delete().eq("medarbetare_id", mal.id)
      : await supabase.from("medarbetare_mat").upsert(
          { medarbetare_id: mal.id, mat, andrad_av: mal.session.medarbetareId },
          { onConflict: "medarbetare_id" },
        );
    if (r.error) return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, medarbetare: data, mat });
}
