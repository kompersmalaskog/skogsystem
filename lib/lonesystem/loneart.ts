// Lönearterna — EN lista, och koderna kommer ur lonesystem_artikelmappning (inte ur koden).
//
// Förut låg Fortnox-koderna (11, 1354, 1355, 1435, 1436, 136, 821) hårdkodade i beräkningen, och admins
// "Löneartskoder" skrev en tabell som ingen läste, med tolv typer som inte ens hette som de sju som
// skickades. Nu: den här listan bestämmer VILKA lönearter exporten använder, tabellen bestämmer VILKEN
// KOD varje har, och Lönesystem-fliken redigerar samma lista. Saknas en kod skickas ingen rad: mängden
// syns som varning (appen gissar aldrig en löneart).

export const LONEARTER = [
  { key: "timlon",             label: "Timlön",              enhet: "tim" },
  { key: "premielon_skordare", label: "Premielön skördare",  enhet: "tim" },
  { key: "premielon_skotare",  label: "Premielön skotare",   enhet: "tim" },
  { key: "overtid_skordare",   label: "Övertid skördare",    enhet: "tim" },
  { key: "overtid_skotare",    label: "Övertid skotare",     enhet: "tim" },
  { key: "valtlappar",         label: "Vältlappar",          enhet: "veckor" },
  { key: "korersattning",      label: "Reseersättning",      enhet: "mil" },
] as const;

export type LoneartKey = (typeof LONEARTER)[number]["key"];
/** Nyckel → Fortnox-kod. En nyckel utan kod finns inte i objektet. */
export type Loneartskoder = Partial<Record<LoneartKey, string>>;

export function loneartInfo(key: string): (typeof LONEARTER)[number] | null {
  return LONEARTER.find(l => l.key === key) ?? null;
}

/** Mappningsraderna → koder. Okända nycklar och tomma koder hoppas över. */
export function loneartskoder(rader: { intern_typ: string; extern_kod: string | null }[]): Loneartskoder {
  const ut: Loneartskoder = {};
  for (const r of rader || []) {
    const info = loneartInfo(r.intern_typ);
    const kod = (r.extern_kod || "").trim();
    if (info && kod) ut[info.key] = kod;
  }
  return ut;
}

/**
 * Läser Fortnox-kopplingens koder. Kastar vid läsfel: en export som kör på "inga koder" för att läsningen
 * föll vore tyst fel. Ingen koppling = inga koder (alla rader saknar då kod och varnar).
 */
export async function hamtaLoneartskoder(supabase: any): Promise<Loneartskoder> {
  const k = await supabase.from("lonesystem_koppling").select("id").eq("system_typ", "fortnox").maybeSingle();
  if (k.error) throw new Error(`Kunde inte läsa löneartskoderna (koppling): ${k.error.message}`);
  if (!k.data?.id) return {};
  const r = await supabase.from("lonesystem_artikelmappning").select("intern_typ, extern_kod").eq("lonesystem_id", k.data.id);
  if (r.error) throw new Error(`Kunde inte läsa löneartskoderna: ${r.error.message}`);
  return loneartskoder(r.data || []);
}
