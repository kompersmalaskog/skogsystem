/**
 * POST /api/personal/bjud-in — admin lägger till en ny medarbetare och bjuder in hen.
 *
 * Det här är den ENDA vägen för nya konton i appen (inställningen "Allow new users to sign up" i Supabase är avstängd,
 * så ingen kan skapa ett konto själv). Service-nyckeln används här och bara här, på servern; klienten skickar namn,
 * e-post, telefon och roll och får tillbaka ett id.
 *
 *  1. kravRoll(ADMIN_ROLLER): utloggad 401, förare 403 — före allt annat.
 *  2. medarbetare-raden skapas FÖRST (med vald roll), sedan inbjudan: kopplingen kontot ↔ raden sker på e-post i två
 *     databastriggrar, så raden ska finnas när kontot skapas. Går inbjudan fel tas raden bort igen (allt eller inget).
 *  3. Finns e-posten redan på en medarbetare UTAN inloggning skickas inbjudan om (förra länken kan ha gått ut);
 *     med inloggning svarar vi 409. Finns kontot redan i Auth kopplas det via triggern och ingen ny inbjudan skickas.
 *  4. Den anställda får ett mail med en länk till /valkommen, där hen väljer lösenord.
 */
import { NextResponse } from "next/server";
import { kravRoll, ADMIN_ROLLER } from "@/lib/auth/server";
import { adminSupabase } from "@/lib/auth/admin";
import { arKontoFinns, arMailGrans, ilikeExakt, tolkaInbjudan } from "@/lib/personal/inbjudan";

export const dynamic = "force-dynamic";

const nej = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  const vakt = await kravRoll(ADMIN_ROLLER);
  if (!vakt.ok) return vakt.res;

  const raw = await request.json().catch(() => null);
  const t = tolkaInbjudan(raw);
  if (!t.ok) return nej(400, t.fel);
  const { namn, epost, telefon, roll } = t.data;

  const db = adminSupabase();

  // Finns personen redan?
  const finns = await db.from("medarbetare").select("id, user_id, namn").ilike("epost", ilikeExakt(epost)).limit(1);
  if (finns.error) return nej(500, "Kunde inte kontrollera om personen redan finns.");
  const befintlig = finns.data?.[0];
  if (befintlig?.user_id) {
    return nej(409, `${befintlig.namn} har redan en inloggning med den e-postadressen.`);
  }

  let id: string;
  let skapadNu = false;
  if (befintlig) {
    id = befintlig.id;
  } else {
    const ins = await db.from("medarbetare").insert({ namn, epost, telefon, roll }).select("id");
    const nyId: string | undefined = ins.data?.[0]?.id;
    if (ins.error || !nyId) return nej(500, "Kunde inte lägga till personen.");
    id = nyId;
    skapadNu = true;
  }

  // Länken i mailet landar på /valkommen på samma adress som admin sitter på.
  const redirectTo = `${new URL(request.url).origin}/valkommen`;
  const inb = await db.auth.admin.inviteUserByEmail(epost, { redirectTo, data: { namn } });

  if (inb.error) {
    if (arKontoFinns(inb.error)) {
      // Kontot fanns redan i Auth. En ny rad kopplas av triggern vid insert; en rad som redan låg där kopplas genom att
      // epost skrivs om (triggern lyssnar på UPDATE OF epost). Ingen ny inbjudan behövs.
      if (!skapadNu) await db.from("medarbetare").update({ epost }).eq("id", id);
      return NextResponse.json({ ok: true, id, inbjudan: "konto_fanns" });
    }
    if (skapadNu) await db.from("medarbetare").delete().eq("id", id);
    if (arMailGrans(inb.error)) return nej(429, "För många mail har skickats just nu. Vänta en stund och försök igen.");
    return nej(502, "Inbjudan kunde inte skickas, och personen lades inte till. Försök igen.");
  }

  return NextResponse.json({ ok: true, id, inbjudan: skapadNu ? "skickad" : "skickad_igen" });
}
