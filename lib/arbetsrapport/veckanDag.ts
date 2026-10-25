/**
 * VECKAN på Dag-vyns högra kolumn (stor skärm, 2026-10-25). Ren, testad: en rad
 * per dag måndag–söndag med arbetad tid = maskintid + extra tid (samma definition
 * som Min tid och löneexporten, lib/arbetstid) och om dagen är bekräftad.
 * Helgdagar utan tid visas inte (en tom lördag är ingen information).
 * Ingen egen månadssumma här: månaden räknas bara av lönebiblioteket (Min tid).
 */
import { extraMinPerDag, type ExtraTidPost } from "@/lib/arbetstid";

export type VeckaArbetsdag = { datum?: string | null; arbetad_min?: number | null; bekraftad?: boolean | null };

export type VeckaRad = {
  datum: string;
  /** "mån", "tis" … */
  dag: string;
  min: number;
  bekraftad: boolean;
  idag: boolean;
  /** Efter idag: tiden finns inte än. */
  framtid: boolean;
};

export type Vecka = { rader: VeckaRad[]; totalMin: number };

const DAG = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function byggVecka(nu: Date, dagar: VeckaArbetsdag[], extra: ExtraTidPost[]): Vecka {
  const extraPerDag = extraMinPerDag(extra);
  const perDag = new Map<string, VeckaArbetsdag>();
  for (const d of dagar || []) if (d?.datum) perDag.set(d.datum, d);
  const idagKey = ymd(nu);
  const mandag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - ((nu.getDay() + 6) % 7));
  const rader: VeckaRad[] = [];
  let totalMin = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(mandag.getFullYear(), mandag.getMonth(), mandag.getDate() + i);
    const k = ymd(d);
    const ad = perDag.get(k);
    const min = Math.max(0, Math.round((ad?.arbetad_min || 0) + (extraPerDag.get(k) || 0)));
    const helg = d.getDay() === 0 || d.getDay() === 6;
    if (helg && min === 0) continue;
    totalMin += min;
    rader.push({ datum: k, dag: DAG[d.getDay()], min, bekraftad: !!ad?.bekraftad, idag: k === idagKey, framtid: k > idagKey });
  }
  return { rader, totalMin };
}
