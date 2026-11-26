// Maskinens konto skapas av sig självt. ENDAST serverkod (service-nyckeln via adminSupabase).
// Anropas av POST /api/maskin/auto när en förare/admin sitter vid en riktig maskindator vars brytare är PÅ och kontot inte finns än.
//
//   * Adressen är bestämd av maskinen (maskin-r64428@maskin.invalid), aldrig något en människa skriver. Den tar inga brev: kontot loggar in
//     bara via engångstoken från servern (generateLink), och lösenordet är slumpat och visas aldrig.
//   * Två enheter som startar samtidigt får samma adress: den som kommer sist får "redan registrerad" och återanvänder det första kontot.
//     Kopplingen i maskin_konto skrivs villkorat (bara där user_id fortfarande är tomt), så ett konto per maskin är en garanti, inte en hopp.
//   * Går något fel efter att auth-användaren skapats tas den bort igen — inget halvt konto blir kvar.
import { slumpLosenord } from "@/lib/maskinkonto/kod";

/** Domäner prövas i ordning. `.invalid` är reserverad (RFC 6761): ingen kan registrera den och ta emot ett lösenordsbyte. example.com är reserverad likadant. */
export const MASKIN_EPOST_DOMANER = ["maskin.invalid", "example.com"] as const;

export const maskinEpost = (maskinId: string, domän: string = MASKIN_EPOST_DOMANER[0]): string =>
  `maskin-${maskinId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}@${domän}`;

export type MaskinKontoSvar =
  | { ok: true; userId: string; epost: string; skapad: boolean }
  | { ok: false; status: number; fel: string };

type Db = any; // supabase-js utan genererade typer (som resten av rutterna)

const finnsRedan = (m?: string | null) => !!m && /already|registered|exists|duplicate/i.test(m);

/** Säkerställer att maskinen har ett konto (auth-användare + medarbetarrad roll 'maskin' + koppling i maskin_konto). Brytaren kontrolleras av ANROPAREN. */
export async function sakraMaskinkonto(db: Db, maskin: { maskin_id: string; visningsnamn: string | null }, av: string | null): Promise<MaskinKontoSvar> {
  const lasKonto = async () => (await db.from("maskin_konto").select("maskin_id, user_id, medarbetare_id, epost").eq("maskin_id", maskin.maskin_id).maybeSingle()).data as
    { maskin_id: string; user_id: string | null; medarbetare_id: string | null; epost: string | null } | null;

  const finns = await lasKonto();
  if (finns?.user_id) return { ok: true, userId: finns.user_id, epost: finns.epost ?? maskinEpost(maskin.maskin_id), skapad: false };

  const namn = maskin.visningsnamn ?? maskin.maskin_id;
  let userId: string | null = null;
  let epost = maskinEpost(maskin.maskin_id);
  let skapadAuth = false;
  let sistaFel: string | undefined;
  for (const dom of MASKIN_EPOST_DOMANER) {
    epost = maskinEpost(maskin.maskin_id, dom);
    const u = await db.auth.admin.createUser({ email: epost, password: slumpLosenord(), email_confirm: true, user_metadata: { namn, maskinkonto: true } });
    if (u.data?.user?.id) { userId = u.data.user.id; skapadAuth = true; break; }
    sistaFel = u.error?.message;
    if (finnsRedan(sistaFel)) {
      // Adressen är redan tagen: en annan start (eller ett avbrutet försök) hann före. Använd den medarbetarrad som hör till adressen.
      const r = await db.from("medarbetare").select("id, user_id").eq("epost", epost).eq("roll", "maskin").maybeSingle();
      if (r.data?.user_id) { userId = r.data.user_id; break; }
      return { ok: false, status: 409, fel: "Kontot håller på att skapas — försök igen om en stund." };
    }
  }
  if (!userId) return { ok: false, status: 500, fel: "Kunde inte skapa maskinens konto." };

  const stada = async (medId?: string) => {
    if (medId) await db.from("medarbetare").delete().eq("id", medId);
    if (skapadAuth && userId) await db.auth.admin.deleteUser(userId);
  };

  // Raden FÖRST med aktiv = false (så den aldrig syns som förare i listor och pushar), sedan kopplingen i maskin_konto.
  let medId: string | undefined;
  const befintlig = await db.from("medarbetare").select("id").eq("user_id", userId).maybeSingle();
  if (befintlig.data?.id) medId = befintlig.data.id;
  else {
    const ins = await db.from("medarbetare").insert({ namn, epost, roll: "maskin", aktiv: false, maskin_id: maskin.maskin_id, user_id: userId }).select("id");
    medId = ins.data?.[0]?.id;
    if (ins.error || !medId) { await stada(); return { ok: false, status: 500, fel: "Kunde inte lägga till maskinkontot." }; }
  }

  const k = await db.from("maskin_konto").update({ user_id: userId, medarbetare_id: medId, epost, andrad: new Date().toISOString(), andrad_av: av }).eq("maskin_id", maskin.maskin_id).is("user_id", null).select("maskin_id");
  if (k.error) { await stada(skapadAuth ? medId : undefined); return { ok: false, status: 500, fel: "Kunde inte koppla kontot till maskinen." }; }
  if (!k.data?.length) {
    // Inget uppdaterades: en annan start hann koppla ett konto först (eller raden saknas). Behåll det som finns, släng vårt.
    const nu = await lasKonto();
    if (nu?.user_id && nu.user_id !== userId) {
      await stada(skapadAuth ? medId : undefined);
      return { ok: true, userId: nu.user_id, epost: nu.epost ?? epost, skapad: false };
    }
    if (!nu) { await stada(skapadAuth ? medId : undefined); return { ok: false, status: 409, fel: "Maskinen har ingen rad för maskinkonto." }; }
  }
  return { ok: true, userId, epost, skapad: skapadAuth };
}
