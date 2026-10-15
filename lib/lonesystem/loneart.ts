// Lönearterna — EN lista, och koderna kommer ur lonesystem_artikelmappning (inte ur koden).
//
// Listan bestämmer VILKA lönearter appen kan skicka och vad de heter; tabellen bestämmer VILKEN KOD varje har i Fortnox.
// Etikett, enhet och förklaring hör alltså till lönearten (`key`), aldrig till en kod: byter bolaget kod för Timlön ändras
// inget här. Koderna står ingenstans i koden utom i testKoder.ts (bara för tester).
//
// Tom kod = ingen rad skickas. Det syns alltid (varning, röd rad i förhandsvisningen), appen gissar aldrig en löneart.
//   - Vanlig löneart utan kod: BLOCKERAR en skarp sändning tills koden är ifylld, eller admin uttryckligen väljer att skicka utan raden.
//   - Frivillig löneart (`valfri`, premielönen): raden hoppas över med en varning och stoppar inget.
//
// Läggs en ny löneart till här syns den av sig själv i Lön → Lönearter (tom = "Ej kopplad") och i förhandsvisningen.

export const LONEARTER = [
  { key: "timlon",             label: "Timlön",             enhet: "tim",    enhetText: "tim",           valfri: false,
    grupp: "Timlön och övertid",
    forklaring: "Ordinarie timmar: arbetade dagar gånger 8." },
  { key: "premielon_skordare", label: "Premielön skördare", enhet: "tim",    enhetText: "tim",           valfri: true,
    grupp: "Timlön och övertid",
    forklaring: "Premie på timlönetimmarna, för tid på skördare. Frivillig." },
  { key: "premielon_skotare",  label: "Premielön skotare",  enhet: "tim",    enhetText: "tim",           valfri: true,
    grupp: "Timlön och övertid",
    forklaring: "Premie på timlönetimmarna, för tid på skotare. Frivillig." },
  { key: "overtid_skordare",   label: "Övertid skördare",   enhet: "tim",    enhetText: "tim",           valfri: false,
    grupp: "Timlön och övertid",
    forklaring: "Timmar utöver arbetade dagar gånger 8, när månaden mest var skördare." },
  { key: "overtid_skotare",    label: "Övertid skotare",    enhet: "tim",    enhetText: "tim",           valfri: false,
    grupp: "Timlön och övertid",
    forklaring: "Timmar utöver arbetade dagar gånger 8, när månaden mest var skotare." },
  { key: "valtlappar",         label: "Vältlappar",         enhet: "veckor", enhetText: "veckor",        valfri: false,
    grupp: "Tillägg",
    forklaring: "Antal veckor med minst en arbetsdag." },
  { key: "korersattning",      label: "Reseersättning",     enhet: "mil",    enhetText: "påbörjade mil", valfri: false,
    grupp: "Tillägg",
    forklaring: "Körning med företagets bil, påbörjade mil över gränsen per dag." },
  { key: "helglon",            label: "Helglön",            enhet: "tim",    enhetText: "tim",           valfri: false,
    grupp: "Tillägg",
    forklaring: "8 timmar för varje röd vardag du inte arbetat (avtalet §10)." },
] as const;

export type LoneartKey = (typeof LONEARTER)[number]["key"];
/** Nyckel → Fortnox-kod. En nyckel utan kod finns inte i objektet. */
export type Loneartskoder = Partial<Record<LoneartKey, string>>;
/** Kod och namnet i Fortnox (mappningens `beskrivning`) — namnet står bredvid koden överallt där en kod visas. */
export type LoneartKoppling = { kod: string; namn: string };
export type Loneartkopplingar = Partial<Record<LoneartKey, LoneartKoppling>>;

export function loneartInfo(key: string): (typeof LONEARTER)[number] | null {
  return LONEARTER.find(l => l.key === key) ?? null;
}

/** Enheten som föraren ser bredvid mängden ("påbörjade mil", inte bara "mil"). Okänd löneart: tomt. */
export function loneartEnhetText(key: string): string {
  return loneartInfo(key)?.enhetText ?? "";
}

/** "112.00" → "112", "14.97" → "14,97" — svenskt decimalkomma, inga döda nollor. */
export function fmtMangd(n: string | number): string {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return String(n);
  return (Math.round(v * 100) / 100).toString().replace(".", ",");
}

type Mappningsrad = { intern_typ: string; extern_kod: string | null; beskrivning?: string | null };

/** Mappningsraderna → kod + namn. Okända nycklar och tomma koder hoppas över. */
export function loneartkopplingar(rader: Mappningsrad[]): Loneartkopplingar {
  const ut: Loneartkopplingar = {};
  for (const r of rader || []) {
    const info = loneartInfo(r.intern_typ);
    const kod = (r.extern_kod || "").trim();
    if (info && kod) ut[info.key] = { kod, namn: (r.beskrivning || "").trim() };
  }
  return ut;
}

/** Mappningsraderna → koder. Okända nycklar och tomma koder hoppas över. */
export function loneartskoder(rader: Mappningsrad[]): Loneartskoder {
  const ut: Loneartskoder = {};
  for (const [key, k] of Object.entries(loneartkopplingar(rader)) as [LoneartKey, LoneartKoppling][]) ut[key] = k.kod;
  return ut;
}

/** Kopplingarna → bara koderna (det beräkningen behöver). */
export function kopplingarTillKoder(k: Loneartkopplingar): Loneartskoder {
  const ut: Loneartskoder = {};
  for (const [key, v] of Object.entries(k) as [LoneartKey, LoneartKoppling][]) ut[key] = v.kod;
  return ut;
}

/**
 * Läser Fortnox-kopplingens koder och namn. Kastar vid läsfel: en export som kör på "inga koder" för att läsningen
 * föll vore tyst fel. Ingen koppling = inga koder (alla rader saknar då kod och varnar).
 */
export async function hamtaLoneartkopplingar(supabase: any): Promise<Loneartkopplingar> {
  const k = await supabase.from("lonesystem_koppling").select("id").eq("system_typ", "fortnox").maybeSingle();
  if (k.error) throw new Error(`Kunde inte läsa löneartskoderna (koppling): ${k.error.message}`);
  if (!k.data?.id) return {};
  const r = await supabase.from("lonesystem_artikelmappning").select("intern_typ, extern_kod, beskrivning").eq("lonesystem_id", k.data.id);
  if (r.error) throw new Error(`Kunde inte läsa löneartskoderna: ${r.error.message}`);
  return loneartkopplingar(r.data || []);
}

/** Bara koderna. Kastar vid läsfel (se hamtaLoneartkopplingar). */
export async function hamtaLoneartskoder(supabase: any): Promise<Loneartskoder> {
  return kopplingarTillKoder(await hamtaLoneartkopplingar(supabase));
}
