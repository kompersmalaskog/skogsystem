import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { autentisera, svar401, svar404Medarbetare } from "@/lib/auth/server";
import { maskinNamnMap, DIM_MASKIN_NAMN_KOLUMNER } from "@/lib/maskinNamn";
import type { Person, PersonLedighet, PersonUtbildning, Skyddsombud } from "@/lib/personal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supaService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Svensk dag i dag, "YYYY-MM-DD" — ledighet som slutat före i dag är inte längre en status. */
function idagSverige(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Ledighet som visas: godkänd ansökan eller registrerad frånvaro (sjuk/VAB). Väntande och nekade är ingen status. */
const LEDIG_STATUS = ["godkänd", "registrerad"];

/**
 * GET /api/personal — Personal-vyn (beslut 2026-11-01). Läses med service-nyckeln, som går förbi RLS.
 * Admin får alla aktiva; en förare får BARA sig själv — aldrig en kollegas telefon, anhörig, utbildning eller
 * ledighet. Rollen kommer ur sessionen, aldrig ur anropet.
 *
 * Svaret bär bara det vyn visar. Hemadress, e-post, lön och friskvård ägs av Admin › Medarbetare och skickas inte.
 * Undantaget är skyddsombudet: namn och telefon visas för ALLA (arbetsmiljölagen — alla ska veta vem det är).
 */
export async function GET() {
  const sess = await autentisera();
  if (!sess.user) return svar401();
  const arAdmin = sess.roll === "admin";
  if (!arAdmin && !sess.medarbetareId) return svar404Medarbetare();

  const supabase = supaService();
  const idag = idagSverige();

  let medFraga = supabase
    .from("medarbetare")
    .select("id, namn, roll, maskin_id, telefon, anhorig_namn, anhorig_telefon, anhorig_relation")
    .eq("aktiv", true)
    .order("namn");
  let utbFraga = supabase
    .from("utbildning_status")
    .select("medarbetare_id, utbildning_namn, status, kravtyp, giltig_till");
  let ledFraga = supabase
    .from("ledighet_ansokningar")
    .select("medarbetare_id, typ, startdatum, slutdatum, status")
    .in("status", LEDIG_STATUS)
    .gte("slutdatum", idag)
    .order("startdatum");
  if (!arAdmin) {
    medFraga = medFraga.eq("id", sess.medarbetareId!);
    utbFraga = utbFraga.eq("medarbetare_id", sess.medarbetareId!);
    ledFraga = ledFraga.eq("medarbetare_id", sess.medarbetareId!);
  }
  const skyddFraga = supabase
    .from("medarbetare")
    .select("id, namn, telefon")
    .eq("aktiv", true)
    .eq("skyddsombud", true)
    .limit(1);

  const [medRes, utbRes, ledRes, maskinRes, skyddRes] = await Promise.all([
    medFraga, utbFraga, ledFraga, supabase.from("dim_maskin").select(DIM_MASKIN_NAMN_KOLUMNER), skyddFraga,
  ]);

  // Personerna och deras utbildning är vyns kärna: ett läsfel där är ett fel. Ledighet, maskinnamn och
  // skyddsombud är stöd — ett läsfel där ger en vy utan den raden, aldrig en påhittad.
  if (medRes.error) return NextResponse.json({ ok: false, error: medRes.error.message }, { status: 500 });
  if (utbRes.error) return NextResponse.json({ ok: false, error: utbRes.error.message }, { status: 500 });
  if (ledRes.error) console.error("[personal] ledighet:", ledRes.error.message);
  if (maskinRes.error) console.error("[personal] dim_maskin:", maskinRes.error.message);
  if (skyddRes.error) console.error("[personal] skyddsombud:", skyddRes.error.message);

  const maskinNamn = maskinNamnMap(maskinRes.data as any[] | null);

  const utbPer: Record<string, PersonUtbildning[]> = {};
  for (const r of (utbRes.data || []) as any[]) {
    if (!r.medarbetare_id) continue;
    (utbPer[r.medarbetare_id] ??= []).push({
      namn: r.utbildning_namn,
      status: r.status,
      kravtyp: r.kravtyp,
      giltig_till: r.giltig_till ?? null,
    });
  }

  // Sorterad på startdatum: den första per person är den pågående eller närmast kommande.
  const ledPer: Record<string, PersonLedighet> = {};
  if (!ledRes.error) {
    for (const l of (ledRes.data || []) as any[]) {
      if (!l.medarbetare_id || ledPer[l.medarbetare_id]) continue;
      ledPer[l.medarbetare_id] = { typ: l.typ, startdatum: l.startdatum, slutdatum: l.slutdatum };
    }
  }

  const personal: Person[] = ((medRes.data || []) as any[]).map((m) => ({
    id: m.id,
    namn: m.namn,
    roll: m.roll,
    maskin_namn: m.maskin_id ? (maskinNamn[m.maskin_id] ?? null) : null,
    telefon: m.telefon,
    anhorig_namn: m.anhorig_namn,
    anhorig_telefon: m.anhorig_telefon,
    anhorig_relation: m.anhorig_relation,
    utbildning: utbPer[m.id] ?? [],
    ledighet: ledPer[m.id] ?? null,
  }));

  const s = !skyddRes.error ? ((skyddRes.data || []) as any[])[0] : null;
  const skyddsombud: Skyddsombud | null = s ? { id: s.id, namn: s.namn, telefon: s.telefon ?? null } : null;

  return NextResponse.json({ ok: true, arAdmin, egenId: sess.medarbetareId, skyddsombud, personal });
}
