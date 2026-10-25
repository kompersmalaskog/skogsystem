/**
 * Synkens flyttloggssteg (mom-import steg 7d): lastbilsflytt ur flyttloggen (maskin_flytt) ger förarens flyttrad. Regeln bor i
 * lib/flyttloggRad.ts; det här är limmet mot databasen.
 *
 * Fail-soft ända ut, som GPS-steget (lib/flyttSynk.ts): migrationen (kalla 'flyttlogg', flytt_id på segment och gravstenar) körs av
 * Martin EFTER att koden är ute, så varje steg som inte går att läsa eller skriva ger ingen rad och en rad i loggen — aldrig ett
 * stopp i synken. Hellre ingen rad än en som kommer tillbaka efter ett svep: går segmenten eller gravstenarna inte att läsa skapas
 * inget alls. Loggen körs FÖRE GPS-steget, och en GPS-rad på samma flytt ersätts (raderas) av loggens rad.
 */
import { planeraFlyttloggsRader, type LogFlytt, type MaskinDag, type UpptagetSegment, type Gravsten } from "./flyttloggRad";

const DYGN_MS = 86_400_000;
const isoDag = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function skapaFlyttloggsRader(supabase: any, dagar: MaskinDag[]): Promise<{ skapade: number; ersatta: number; skippade?: string }> {
  const maskindagar = dagar.filter(d => d.maskin_id && d.start_tid && d.slut_tid);
  if (!maskindagar.length || maskindagar.every(d => d.skyddad)) return { skapade: 0, ersatta: 0 }; // inget att skriva på
  const maskiner = [...new Set(maskindagar.map(d => d.maskin_id as string))];
  const datum = [...new Set(maskindagar.map(d => d.datum))].sort();
  const ids = [...new Set(maskindagar.map(d => d.medarbetare_id))];
  // Brett fönster på rå tid (UTC kan ligga ett dygn från den lokala dagen); planeringen väljer på lokal dag.
  const fran = `${isoDag(Date.parse(`${datum[0]}T00:00:00Z`) - DYGN_MS)}T00:00:00Z`;
  const till = `${isoDag(Date.parse(`${datum[datum.length - 1]}T00:00:00Z`) + 2 * DYGN_MS)}T00:00:00Z`;

  const { data: flyttar, error: flyttFel } = await supabase.from("maskin_flytt")
    .select("id, maskin_id, avbruten, hamtad_tid, sluttid, fran_objekt_id, till_objekt_id, fran_plats_id, till_plats_id, flytt_km")
    .in("maskin_id", maskiner).gte("hamtad_tid", fran).lte("hamtad_tid", till);
  if (flyttFel) { console.warn("flyttlogg: maskin_flytt kunde inte läsas — ingen flyttrad skapas:", flyttFel.message); return { skapade: 0, ersatta: 0, skippade: "flyttlogg" }; }
  if (!flyttar?.length) return { skapade: 0, ersatta: 0 };

  const { data: segment, error: segFel } = await supabase.from("arbetsdag_segment")
    .select("id, medarbetare_id, datum, start_tid, slut_tid, kalla, flytt_id").in("medarbetare_id", ids).in("datum", datum);
  if (segFel) { console.warn("flyttlogg: arbetsdag_segment kunde inte läsas (migration ej körd?) — ingen flyttrad skapas:", segFel.message); return { skapade: 0, ersatta: 0, skippade: "segment" }; }
  const { data: borta, error: bortaFel } = await supabase.from("arbetsdag_flytt_borta")
    .select("medarbetare_id, datum, start_tid, slut_tid, flytt_id").in("medarbetare_id", ids).in("datum", datum);
  if (bortaFel) { console.warn("flyttlogg: gravstenarna kunde inte läsas (migration ej körd?) — ingen flyttrad skapas:", bortaFel.message); return { skapade: 0, ersatta: 0, skippade: "gravstenar" }; }

  // Trakternas namn: objekt (uuid) eller flyttplats. Ett läsfel ger "Okänd plats", aldrig ett id.
  const namn = { objekt: {} as Record<string, string>, plats: {} as Record<string, string> };
  const lasNamn = async (tabell: "objekt" | "flyttplats", idn: (string | null)[], ut: Record<string, string>) => {
    const unika = [...new Set(idn.filter(Boolean))] as string[];
    if (!unika.length) return;
    const { data, error } = await supabase.from(tabell).select("id, namn").in("id", unika);
    if (error) { console.warn(`flyttlogg: ${tabell} (namn) kunde inte läsas:`, error.message); return; }
    for (const r of data || []) ut[r.id] = r.namn;
  };
  const lista = flyttar as LogFlytt[];
  await lasNamn("objekt", lista.flatMap(f => [f.fran_objekt_id, f.till_objekt_id]), namn.objekt);
  await lasNamn("flyttplats", lista.flatMap(f => [f.fran_plats_id, f.till_plats_id]), namn.plats);

  const plan = planeraFlyttloggsRader({
    flyttar: lista, dagar: maskindagar, upptagna: (segment || []) as UpptagetSegment[], borta: (borta || []) as Gravsten[], namn,
  });
  if (!plan.skapa.length) return { skapade: 0, ersatta: 0 };

  // Loggen går före GPS: en GPS-rad på samma flytt raderas (en rad, inte två). Faller raderingen skrivs ingenting.
  if (plan.ersatt.length) {
    const { error: delFel } = await supabase.from("arbetsdag_segment").delete().in("id", plan.ersatt);
    if (delFel) { console.warn("flyttlogg: GPS-raden kunde inte ersättas:", delFel.message); return { skapade: 0, ersatta: 0, skippade: "ersatt" }; }
  }
  let skapade = 0;
  for (const rad of plan.skapa) {
    const { error } = await supabase.from("arbetsdag_segment").insert(rad);
    if (!error) { skapade++; continue; }
    if (error.code === "23P01" || error.code === "23505") continue; // överlappar något synken inte kände till, eller en annan synk hann före (unikt per flytt)
    console.warn("flyttlogg: flyttraden kunde inte skrivas (migration ej körd?):", error.message);
    return { skapade, ersatta: plan.ersatt.length, skippade: "insert" };
  }
  return { skapade, ersatta: plan.ersatt.length };
}
