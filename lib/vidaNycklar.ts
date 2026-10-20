// STABILA NYCKLAR för Vidas objekt (objekt_geometri), så att vår kommentar och våra foton på ett Vida-objekt kan sparas hos OSS (objekt_yta_anteckning och
// objekt_yta_media, kopplade till objekt_id + yta_nyckel) utan att Vidas data någonsin ändras. Ytor, punkter och RAÄ-objekt har egna id-fält som
// `ytaNyckel` redan läser (hansyn:<LOPNR>, traktdel:<TRDEL_ID>, nb:<Beteckn>, raa:<lamningsnu>, punkt:<nr>). Vidas LINJER (kraftledning, basväg) har inget
// känt id-fält i dbf:en — de nycklas på beskrivningen (FLBESKR) och ordningen bland linjer med samma beskrivning: `linje:kraftledning:0`, `linje:kraftledning:1` …
// Ordningen följer leveransen och är stabil så länge Vida levererar linjerna i samma ordning (en omimport med ändrad ordning kan flytta en kommentar till en
// annan ledning på samma trakt — samma begränsning som kvittensen har med `vida:<lager>:<index>`).

import { ytaNyckel } from './traktGeometri';

const slug = (s: unknown): string => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'linje';

const arVidaLinje = (f: any): boolean => String(f?.properties?._lager ?? '') === 'L_TILLAGGSLINJER' || String(f?.properties?._typ ?? '') === 'linje';

/** Nyckeln per feature, i samma ordning som `features` (null = featuren kan inte få en stabil nyckel och därmed ingen kommentar/foto). */
export function vidaNycklar(features: readonly any[] | null | undefined): (string | null)[] {
  const raknare = new Map<string, number>();
  return (features ?? []).map((f) => {
    const p = f?.properties ?? {};
    if (arVidaLinje(f)) {
      const s = slug(p.FLBESKR);
      const n = raknare.get(s) ?? 0;
      raknare.set(s, n + 1);
      return `linje:${s}:${n}`;
    }
    return ytaNyckel(p);
  });
}

/** Samlingen med `_nyckel` satt på varje feature som har en (en kopia — indatan rörs aldrig). Ritas på kartan och läses av trycket. */
export function medVidaNycklar<T extends { features?: any[] }>(fc: T): T {
  const nycklar = vidaNycklar(fc.features);
  return { ...fc, features: (fc.features ?? []).map((f, i) => (nycklar[i] ? { ...f, properties: { ...(f.properties ?? {}), _nyckel: nycklar[i] } } : f)) };
}
