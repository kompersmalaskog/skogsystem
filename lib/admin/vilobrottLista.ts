// Vilobrott för admin: en lista, två användare (Lön → Vilobrott och Översiktens att-göra-lista).
//
// Brotten RÄKNAS om ur arbetsdag + extra_tid (lib/vilobrott) — det som förarens app ännu inte hunnit
// upptäcka finns alltså med — och förarens svar läggs på ur tabellen vilobrott. Ett brott utan svar är
// "obesvarat" och det enda som kräver något; ett besvarat står kvar, grått, med svaret.
// 0 h-brott (för lite underlag, inte ett verkligt brott) filtreras bort med arTroligtVilobrott.
import { supabase } from "@/lib/supabase";
import { analyseraVilobrott, medPerioddagSpann, arTroligtVilobrott, vilobrottDagar, type Vilobrott, type VilobrottDagar, type VilaTrosklar } from "@/lib/vilobrott";
import { hamtaGiltigtAvtal, vilaTrosklarFromAvtal } from "@/lib/gs-avtal";
import { vilaSvarText } from "@/lib/dagFragor";
import { ymdLokal } from "@/lib/datumLokal";

export type VilobrottRad = Vilobrott & {
  medarbetare_id: string;
  namn: string;
  /** Förarens svar i klartext ("Planerat enligt avtal"). Null = obesvarat. */
  svar: string | null;
  /** Dagarna brottet gäller (passen, vilan och var den ligger). Null = brottet gick inte att peka ut i underlaget; då visas bara beskrivningen. */
  dagar: VilobrottDagar | null;
  /** Admins egen markering att brottet är hanterat (t.ex. kompensationsledighet). Skild från förarens svar: admin svarar aldrig åt föraren. */
  hanterat: Hanterat | null;
};

export type Hanterat = {
  /** När (satt av databasen). */
  tid: string;
  /** Vem, i klartext (förnamn efternamn ur medarbetare). "okänd" när personen inte finns kvar. */
  av: string;
  anteckning: string | null;
};

type Medarbetare = { id: string; namn: string | null; /** Företagsledare / delägare: arbetstidslagen gäller inte, de får inga vilobrott. */ foretagsledare?: boolean | null };
type Dag = { medarbetare_id: string; datum: string; start_tid: string | null; slut_tid: string | null };
type Svar = {
  medarbetare_id: string; datum: string; typ: string; besvarat_av_forare: boolean | null; orsak: string | null; orsak_fritext: string | null;
  /** Admins kvittering (migration 20261025180000). Saknas kolumnerna läses raden utan dem. */
  kvitterad_tid?: string | null; kvitterad_av_chef?: string | null; kvitterad_anteckning?: string | null;
};

const nyckel = (medId: string, datum: string, typ: string) => `${medId}|${datum}|${typ}`;

/** Ren uträkning: underlag in, brott med namn och svar ut, senaste först. */
export function beraknaVilobrottLista(indata: {
  medarbetare: Medarbetare[];
  arbetsdagar: Dag[];
  perioder: Dag[];
  svar: Svar[];
  trosklar: VilaTrosklar;
  /** Ögonblicket (Stockholms väggklocka) underlaget är komplett t.o.m.; utan det det riktiga nu (listan läser fram till i dag). */
  nu?: Date | null;
}): VilobrottRad[] {
  const { medarbetare, arbetsdagar, perioder, svar, trosklar, nu } = indata;
  const namnMap = new Map(medarbetare.map(m => [m.id, m.namn || m.id.slice(0, 8)]));
  // Företagsledare (medarbetare.foretagsledare, samma flagga som tar bort deras lönerader) analyseras inte alls: ATL gäller inte företagsledande ställning.
  const ledare = new Set(medarbetare.filter(m => m.foretagsledare === true).map(m => m.id));
  const dagPerMed = new Map<string, Dag[]>();
  for (const d of arbetsdagar) {
    if (!d.medarbetare_id) continue;
    if (!dagPerMed.has(d.medarbetare_id)) dagPerMed.set(d.medarbetare_id, []);
    dagPerMed.get(d.medarbetare_id)!.push(d);
  }
  const perPerMed = new Map<string, Dag[]>();
  for (const p of perioder) {
    if (!p.medarbetare_id) continue;
    if (!perPerMed.has(p.medarbetare_id)) perPerMed.set(p.medarbetare_id, []);
    perPerMed.get(p.medarbetare_id)!.push(p);
  }
  // Medarbetare som BARA har perioder (ingen arbetsdag-rad i fönstret) ska också analyseras.
  for (const medId of Array.from(perPerMed.keys())) if (!dagPerMed.has(medId)) dagPerMed.set(medId, []);
  const svarMap = new Map<string, Svar>();
  const hanteratMap = new Map<string, Hanterat>();
  for (const r of svar) {
    const k = nyckel(r.medarbetare_id, r.datum, r.typ);
    if (r.besvarat_av_forare) svarMap.set(k, r);
    if (r.kvitterad_tid) hanteratMap.set(k, {
      tid: r.kvitterad_tid,
      av: (r.kvitterad_av_chef && namnMap.get(r.kvitterad_av_chef)) || "okänd",
      anteckning: r.kvitterad_anteckning?.trim() || null,
    });
  }

  const ut: VilobrottRad[] = [];
  dagPerMed.forEach((dagar, medId) => {
    if (ledare.has(medId)) return;
    const spann = medPerioddagSpann(dagar, perPerMed.get(medId) || []);
    const brott = analyseraVilobrott(spann, trosklar, nu);
    for (const b of brott.filter(arTroligtVilobrott)) {
      const r = svarMap.get(nyckel(medId, b.datum, b.typ));
      ut.push({ ...b, medarbetare_id: medId, namn: namnMap.get(medId) || medId.slice(0, 8), svar: r ? vilaSvarText(r.orsak, r.orsak_fritext) : null, dagar: vilobrottDagar(b, spann, trosklar, nu), hanterat: hanteratMap.get(nyckel(medId, b.datum, b.typ)) ?? null });
    }
  });
  return ut.sort((a, b) => b.datum.localeCompare(a.datum));
}

const SVAR_KOLUMNER = "medarbetare_id, datum, typ, besvarat_av_forare, orsak, orsak_fritext";
/** Förarens svar + admins kvittering. Saknas kvitteringskolumnen (migration 20261025180000 ej körd) läses svaren utan den — aldrig ett fel i listan. */
async function lasSvar(fran: string) {
  const res = await supabase.from("vilobrott").select(`${SVAR_KOLUMNER}, kvitterad_tid, kvitterad_av_chef, kvitterad_anteckning`).gte("datum", fran);
  if (res.error && /42703|PGRST204|kvitterad_anteckning/.test(`${res.error.code ?? ""} ${res.error.message ?? ""}`)) {
    return supabase.from("vilobrott").select(SVAR_KOLUMNER).gte("datum", fran);
  }
  return res;
}

/** Läser underlaget (senaste tre månaderna) och räknar. Kastar vid läsfel: ett fel är aldrig "inga brott". */
export async function laddaVilobrottLista(idag: Date = new Date()): Promise<VilobrottRad[]> {
  const fran = ymdLokal(new Date(idag.getFullYear(), idag.getMonth() - 3, 1));
  const [medRes, arbRes, perRes, svarRes, avtal] = await Promise.all([
    supabase.from("medarbetare").select("id, namn, foretagsledare").order("namn"),
    supabase.from("arbetsdag").select("medarbetare_id, datum, start_tid, slut_tid").gte("datum", fran).order("datum"),
    // Perioddagarna: arbetstidslagen gäller all arbetstid, inte bara maskintid.
    supabase.from("extra_tid").select("medarbetare_id, datum, start_tid, slut_tid").gte("datum", fran).not("slut_tid", "is", null),
    // Förarens svar, så ett besvarat brott aldrig står som obesvarat här när det är besvarat hos föraren, och admins "hanterat".
    lasSvar(fran),
    hamtaGiltigtAvtal(idag),
  ]);
  if (medRes.error) throw medRes.error;
  if (arbRes.error) throw arbRes.error;
  if (perRes.error) throw new Error(`Kunde inte läsa perioderna (extra_tid): ${perRes.error.message}`);
  if (svarRes.error) throw new Error(`Kunde inte läsa förarnas svar (vilobrott): ${svarRes.error.message}`);
  return beraknaVilobrottLista({
    medarbetare: (medRes.data || []) as Medarbetare[],
    arbetsdagar: (arbRes.data || []) as Dag[],
    perioder: (perRes.data || []) as Dag[],
    svar: (svarRes.data || []) as Svar[],
    trosklar: vilaTrosklarFromAvtal(avtal),
  });
}
