/**
 * "Välj koden från maskinen" — bara maskinkontot (brytaren på).
 *
 *   POST { medarbetare_id }   personen har tryckt på sitt namn i "Vem är du?" och har ingen kod: skicka en push till hens telefon
 *                             ("Välj din kod för <maskin>", ett tryck öppnar Mer › Kod för maskinen). Högst en notis per person och två minuter
 *                             (avgörs i databasen, maskin_kod_notis_begar). Svaret säger bara vad arket ska visa: harKod, harPush, skickad, vantarTill.
 *   GET  ?medarbetare_id=     har personen valt sin kod än? (arket frågar medan det väntar). Läsning — upplåser aldrig något.
 *
 * Maskinen låser ALDRIG upp av sig själv: den här rutten ger aldrig en token. Upplåsningen sker bara i /api/maskin/las-upp, med koden.
 * Varje begäran loggas (maskin_upplasning_logg). Svaret och notisen bär aldrig koden eller något personligt.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/auth/admin";
import { kravMaskinkonto, nej } from "@/lib/maskinkonto/server";
import { koaKodVal } from "@/lib/maskinkonto/notis";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = { id: string; aktiv: boolean | null; roll: string };
/** Bara en aktiv förare eller admin kan få notisen. */
async function hittaPerson(db: ReturnType<typeof adminSupabase>, id: string): Promise<Person | null> {
  const { data: p } = await db.from("medarbetare").select("id, aktiv, roll").eq("id", id).maybeSingle();
  if (!p || !p.aktiv || (p.roll !== "forare" && p.roll !== "admin")) return null;
  return p as Person;
}

export async function GET(request: Request) {
  const vakt = await kravMaskinkonto();
  if (!vakt.ok) return vakt.res;
  const id = new URL(request.url).searchParams.get("medarbetare_id") ?? "";
  if (!UUID.test(id)) return nej(400, "Fel indata");
  const db = adminSupabase();
  const p = await hittaPerson(db, id);
  if (!p) return nej(404, "Personen finns inte");
  const { data, error } = await db.from("forare_maskinkod").select("medarbetare_id").eq("medarbetare_id", p.id).maybeSingle();
  if (error) return nej(500, "Kunde inte läsa.");
  return NextResponse.json({ ok: true, harKod: !!data });
}

export async function POST(request: Request) {
  const vakt = await kravMaskinkonto();
  if (!vakt.ok) return vakt.res;
  const body = await request.json().catch(() => null) as { medarbetare_id?: unknown } | null;
  if (!body || typeof body.medarbetare_id !== "string" || !UUID.test(body.medarbetare_id)) return nej(400, "Fel indata");

  const db = adminSupabase();
  const logga = (utfall: string, medarbetareId: string | null, detalj?: string) =>
    db.from("maskin_upplasning_logg").insert({ maskin_id: vakt.maskinId, medarbetare_id: medarbetareId, utfall, detalj: detalj ?? null }).then(() => undefined, () => undefined);

  const p = await hittaPerson(db, body.medarbetare_id);
  if (!p) { await logga("avslagen", null, "kodnotis: okänd eller inaktiv person"); return nej(404, "Personen finns inte"); }

  // Har hen redan en kod finns inget att skicka — arket visar plattan.
  const kod = await db.from("forare_maskinkod").select("medarbetare_id").eq("medarbetare_id", p.id).maybeSingle();
  if (kod.error) return nej(500, "Kunde inte kontrollera koden.");
  if (kod.data) return NextResponse.json({ ok: true, harKod: true, harPush: true, skickad: false, vantarTill: null });

  // Telefonens push (inte maskinens egna prenumerationer). Saknas den: reservtexten, ingen notis, inget fel.
  const subs = await db.from("push_subscriptions").select("id").eq("medarbetare_id", p.id).is("maskin_id", null).limit(1);
  if (subs.error) return nej(500, "Kunde inte kontrollera telefonen.");
  if ((subs.data ?? []).length === 0) {
    await logga("kod_notis_ingen_push", p.id);
    return NextResponse.json({ ok: true, harKod: false, harPush: false, skickad: false, vantarTill: null });
  }

  // Högst en notis per person och två minuter — avgörs och loggas i databasen (ett lås per person).
  const gate = await db.rpc("maskin_kod_notis_begar", { p_med: p.id, p_maskin: vakt.maskinId });
  const g = (Array.isArray(gate.data) ? gate.data[0] : gate.data) as { tillat?: boolean; vantar_till?: string | null; tid?: string | null } | null;
  if (gate.error || !g) return nej(500, "Kunde inte skicka notisen.");
  if (!g.tillat) return NextResponse.json({ ok: true, harKod: false, harPush: true, skickad: false, vantarTill: g.vantar_till ?? null });

  const { data: m } = await db.from("dim_maskin").select("visningsnamn").eq("maskin_id", vakt.maskinId).maybeSingle();
  const koa = await koaKodVal(db, { medarbetareId: p.id, maskinNamn: m?.visningsnamn ?? vakt.maskinId, tid: g.tid ?? new Date().toISOString() }, request);
  if (!koa.ok) return nej(500, "Kunde inte skicka notisen.");
  return NextResponse.json({ ok: true, harKod: false, harPush: true, skickad: true, vantarTill: g.vantar_till ?? null });
}
