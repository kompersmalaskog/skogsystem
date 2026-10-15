// Vilka lönearter hindrar en skarp sändning? EN funktion, delad av exportrouten (som svarar 409) och förhandsvisningen (som
// visar de röda raderna och spärrar knappen), så de två aldrig kan säga olika.
//
// En rad blockerar när lönearten HAR ett antal (den finns i `lonerader`), saknar kod, inte är frivillig (premien) och förarens
// rader fortfarande ska skickas (status inte 'skickat' — en redan skickad förare skickas aldrig om).
import { LONEARTER, type LoneartKey } from "./loneart";
import type { LoneRad } from "./loneberakning";

export type BlockerandeLoneart = {
  loneart: LoneartKey;
  label: string;
  enhet: string;
  forare: { namn: string; mangd: string }[];
};

type Medarbetarrad = { namn: string; status: string; lonerader?: LoneRad[] };

export function blockerandeLonearter(medarbetare: Medarbetarrad[]): BlockerandeLoneart[] {
  const ut: BlockerandeLoneart[] = [];
  for (const art of LONEARTER) {
    const forare: BlockerandeLoneart["forare"] = [];
    for (const m of medarbetare || []) {
      if (m.status === "skickat") continue;
      for (const r of m.lonerader || []) {
        if (r.loneart === art.key && r.status === "saknar_kod") forare.push({ namn: m.namn, mangd: r.mangd });
      }
    }
    if (forare.length > 0) ut.push({ loneart: art.key, label: art.label, enhet: art.enhet, forare });
  }
  return ut;
}

/** Antal röda rader (en per förare och löneart) — siffran på spärren. */
export function antalBlockerande(b: BlockerandeLoneart[]): number {
  return b.reduce((s, x) => s + x.forare.length, 0);
}
