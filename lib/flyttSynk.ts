/**
 * Synkens flyttsteg (mom-import steg 7d): skapar maskinflytt som egen rad i förarens dag. Regeln bor i lib/flyttRad.ts;
 * det här är limmet mot databasen.
 *
 * Fail-soft ända ut: migrationen (arbetsdag_segment.kalla 'flytt', arbetsdag_flytt_borta, RPC flytt_luckor) körs av
 * Martin EFTER att koden är ute, så varje steg som inte går att läsa eller skriva ger ingen flyttrad och en rad i loggen —
 * aldrig ett stopp i synken. Och hellre ingen rad än en som kommer tillbaka efter att föraren tagit bort den: går
 * gravstenarna eller de befintliga segmenten inte att läsa skapas inget alls.
 */
import { FLYTT_MIN_MIN, planeraFlyttar, type GpsLucka } from "./flyttRad";

export type FlyttDag = { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null; maskin_id: string | null };
type Tid = { start_tid: string; slut_tid: string };

const nyckel = (medarbetareId: string, datum: string) => `${medarbetareId}_${datum}`;

export async function skapaFlyttRader(supabase: any, dagar: FlyttDag[]): Promise<{ skapade: number; skippade?: string }> {
  const arbetsdagar = dagar.filter(d => d.start_tid && d.slut_tid && d.maskin_id);
  if (!arbetsdagar.length) return { skapade: 0 };
  const ids = [...new Set(arbetsdagar.map(d => d.medarbetare_id))];
  const datum = [...new Set(arbetsdagar.map(d => d.datum))];

  const lasTider = async (tabell: string): Promise<Map<string, Tid[]> | null> => {
    const { data, error } = await supabase.from(tabell).select("medarbetare_id, datum, start_tid, slut_tid").in("medarbetare_id", ids).in("datum", datum);
    if (error) { console.warn(`flytt: ${tabell} kunde inte läsas — ingen flyttrad skapas:`, error.message); return null; }
    const m = new Map<string, Tid[]>();
    for (const r of data || []) { const k = nyckel(r.medarbetare_id, r.datum); (m.get(k) || m.set(k, []).get(k)!).push({ start_tid: r.start_tid, slut_tid: r.slut_tid }); }
    return m;
  };
  const upptagna = await lasTider("arbetsdag_segment");
  if (!upptagna) return { skapade: 0, skippade: "segment" };
  const borta = await lasTider("arbetsdag_flytt_borta");
  if (!borta) return { skapade: 0, skippade: "gravstenar" };

  let skapade = 0;
  for (const d of arbetsdagar) {
    const { data: luckor, error } = await supabase.rpc("flytt_luckor", { p_maskin_id: d.maskin_id, p_datum: d.datum, p_min_min: FLYTT_MIN_MIN });
    if (error) {
      console.warn("flytt: flytt_luckor kunde inte anropas (migration ej körd?):", error.message);
      return { skapade, skippade: "rpc" };
    }
    if (!luckor?.length) continue;

    const objektIds = [...new Set((luckor as GpsLucka[]).flatMap(l => [l.fran_objekt_id, l.till_objekt_id]).filter(Boolean))] as string[];
    const objektNamn: Record<string, string> = {};
    const { data: namn, error: namnFel } = await supabase.from("dim_objekt").select("objekt_id, object_name").in("objekt_id", objektIds);
    if (namnFel) console.warn("flytt: trakternas namn kunde inte läsas:", namnFel.message);
    for (const o of namn || []) objektNamn[o.objekt_id] = o.object_name;

    const k = nyckel(d.medarbetare_id, d.datum);
    const rader = planeraFlyttar({
      medarbetareId: d.medarbetare_id,
      dag: { datum: d.datum, start_tid: d.start_tid, slut_tid: d.slut_tid },
      luckor: (luckor as any[]).map(l => ({ ...l, start: l.start_lokal, slut: l.slut_lokal })),
      upptagna: upptagna.get(k) || [], borta: borta.get(k) || [], objektNamn,
    });
    for (const rad of rader) {
      const { error: insFel } = await supabase.from("arbetsdag_segment").insert(rad);
      if (!insFel) { skapade++; (upptagna.get(k) || upptagna.set(k, []).get(k)!).push({ start_tid: rad.start_tid, slut_tid: rad.slut_tid }); continue; }
      if (insFel.code === "23P01") continue; // överlappar något synken inte kände till — hoppa över, ingen dubbelräkning
      console.warn("flytt: flyttraden kunde inte skrivas (migration ej körd?):", insFel.message);
      return { skapade, skippade: "insert" };
    }
  }
  return { skapade };
}
