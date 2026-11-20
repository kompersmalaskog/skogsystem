/**
 * sammaTrakt.ts — när maskinens dator lagt EN trakt på flera objekt (2026-10-21).
 *
 * Bågskyttebanan RP J-Hus- 25: Giantens dator skapade objekt 133 och 134, samma
 * namn, sista filen samma förmiddag. Martin: "bågskyttebanan är en trakt".
 *
 * Regeln (Martin 2026-10-21): två objekt är samma trakt när de har
 *   1) samma maskin (objektnyckelns första del),
 *   2) exakt samma namn (efter trim; tomt namn slås aldrig ihop), och
 *   3) sista filerna inom SAMMA_TRAKT_DAGAR från varandra (kedjat: A–B och B–C
 *      inom gränsen gör A, B, C till en trakt).
 * Samma namn räcker inte: "HUSHÅLLNINGSSÄLLSKAPET DALARNA GÄVLEBORG" är
 * beställarens namn på två jobb med filer i maj och juni — de är två trakter.
 *
 * Nycklarna filerna skrivits under rörs aldrig; ihopslagningen sker bara när
 * apteringsvyn räknas. Huvudnyckeln (den som vyn lagras och öppnas under) är
 * gruppens första nyckel i sorterad ordning, så den är densamma varje gång.
 */
import type { HprProduct } from "./hpr-parser";
import type { ObjektData } from "./objekt-data";

export const SAMMA_TRAKT_DAGAR = 7;

export interface TraktMeta {
  object_key: string;
  object_name: string | null;
  status: "active" | "completed";
  last_file_at: string | null;
}

const maskin = (key: string) => key.split(":")[0];
const tid = (t: string | null) => (t == null ? NaN : Date.parse(t));

/** Gruppera objekten i trakter. Varje grupp är sorterad; [0] är huvudnyckeln. */
export function traktGrupper(objekt: TraktMeta[]): string[][] {
  const perNamn = new Map<string, TraktMeta[]>();
  const ensamma: string[][] = [];
  for (const o of objekt) {
    const namn = o.object_name?.trim();
    if (!namn || Number.isNaN(tid(o.last_file_at))) {
      ensamma.push([o.object_key]);
      continue;
    }
    const k = `${maskin(o.object_key)}\u0000${namn}`;
    const lista = perNamn.get(k);
    if (lista) lista.push(o);
    else perNamn.set(k, [o]);
  }
  const grupper: string[][] = [...ensamma];
  const grans = SAMMA_TRAKT_DAGAR * 86400000;
  for (const lista of perNamn.values()) {
    lista.sort((a, b) => tid(a.last_file_at) - tid(b.last_file_at));
    let grupp: string[] = [];
    let forra = NaN;
    for (const o of lista) {
      const t = tid(o.last_file_at);
      if (grupp.length && t - forra > grans) {
        grupper.push(grupp);
        grupp = [];
      }
      grupp.push(o.object_key);
      forra = t;
    }
    if (grupp.length) grupper.push(grupp);
  }
  return grupper.map((g) => [...g].sort());
}

/** Gruppen ett objekt hör till (sig självt om det är ensamt). */
export function gruppFor(objectKey: string, objekt: TraktMeta[]): string[] {
  return traktGrupper(objekt).find((g) => g.includes(objectKey)) ?? [objectKey];
}

/** Levande meta för en trakt: namnet, aktiv om någon del är aktiv, senaste filen. */
export function traktMeta(delar: TraktMeta[]): TraktMeta {
  const sorterade = [...delar].sort((a, b) => a.object_key.localeCompare(b.object_key));
  const senast = [...delar].sort((a, b) => (tid(b.last_file_at) || 0) - (tid(a.last_file_at) || 0))[0];
  return {
    object_key: sorterade[0].object_key,
    object_name: sorterade[0].object_name,
    status: delar.some((d) => d.status === "active") ? "active" : "completed",
    last_file_at: senast.last_file_at,
  };
}

const matrisAvtryck = (p: HprProduct) =>
  JSON.stringify([...p.cells].sort((a, b) => a.diaLower - b.diaLower || a.lenLower - b.lenLower)
    .map((c) => [c.diaLower, c.lenLower, c.distribution, c.limitation]));

/**
 * Slå ihop delarnas data till en trakt: alla stockar, produkterna en gång var.
 * En produkt som finns i flera delar måste ha SAMMA beställning (matris och
 * fördelningsmål) — annars finns inget enda mål att mäta mot, och då kastas
 * ett fel i stället för att räkna mot fel beställning.
 */
export function slaIhopData(huvudnyckel: string, delar: ObjektData[]): ObjektData {
  const produkter = new Map<string, HprProduct>();
  for (const d of delar) {
    for (const p of d.produkter) {
      const finns = produkter.get(p.productKey);
      if (!finns) {
        produkter.set(p.productKey, p);
        continue;
      }
      if (finns.distributionAllowed !== p.distributionAllowed || matrisAvtryck(finns) !== matrisAvtryck(p)) {
        throw new Error(`Produkt ${p.productKey} har olika beställning i ${delar.map((x) => x.objectKey).join(" och ")} — slås inte ihop`);
      }
    }
  }
  return {
    objectKey: huvudnyckel,
    produkter: [...produkter.values()],
    stockar: delar.flatMap((d) => d.stockar),
  };
}
