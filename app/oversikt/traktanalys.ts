// VAD TRAKTANALYSEN HITTAT — visning i Översikten (Martin 2026-11-05: "se det direkt, på kartan och i texten om trakten").
//
// DATAN BYGGS AV ANDRA SPÅRET (Besök/markägare): analysen körs på servern vid Vida-importen och varje natt och sparas i objekt.trakt_data.beraknad.
// Den spåret levererar EN funktion som ger märkena per trakt. Här tolkas ingenting själv — `lasTraktAnalys` är kopplingen, och tills den PR:en är
// mergad svarar den 'ej_kopplad' (sidan visar då ingenting, varken rad eller markör).
//
// Regler för visningen:
//   • Inget hittat = ingen rad. Aldrig "ingen fossil åker": RAÄ har långt ifrån allt registrerat — tomt är ingen bekräftelse.
//   • Kunde analysen inte köras står "Kunde inte kontrolleras" — aldrig tomt, för tomt läses som "inget finns".
//   • Färg efter kategori ur appens färgspråk (lib/larm/grupper): barmark = Kultur (brun), vattenskydd = Blött (blå), skydd = Natur (grön).
//     Färgen står aldrig ensam: märkets text står alltid bredvid.

import { GRUPPER, type FargGrupp } from '@/lib/larm/grupper';

export type FyndKategori = 'barmark' | 'vattenskydd' | 'skydd';

export interface TraktFynd {
  kategori: FyndKategori;
  /** Märket i klartext, som funktionen ger det ("Fossil åker · barmark", "Vattenskydd"). */
  text: string;
  /** Där fyndet ligger på trakten — markören. Saknas = bara raden. */
  plats: { lat: number; lng: number } | null;
}

export type TraktAnalys =
  | { lage: 'ej_kopplad' }                 // datan finns inte än (andra spårets PR ej mergad)
  | { lage: 'fel' }                        // analysen kunde inte köras (tjänsten nere)
  | { lage: 'klar'; fynd: TraktFynd[] };   // körd; tom lista = inget hittat (ingen rad, ingen bekräftelse)

export const KATEGORI_GRUPP: Record<FyndKategori, FargGrupp> = { barmark: 'kultur', vattenskydd: 'blott', skydd: 'natur' };
export const fyndFarg = (k: FyndKategori): string => GRUPPER[KATEGORI_GRUPP[k]].farg;
export const KONTROLLERA_FEL_TEXT = 'Kunde inte kontrolleras';

/**
 * Traktens analys. KOPPLINGEN: byts mot andra spårets funktion när den PR:en är mergad (Martin säger till och vad den heter).
 * Fram till dess: 'ej_kopplad' för alla trakter — ingenting visas, ingenting gissas.
 */
export function lasTraktAnalys(_o: { id: string; trakt_data?: unknown }): TraktAnalys {
  return { lage: 'ej_kopplad' };
}

/** Raderna i texten om trakten: ett märke per rad, i den ordning funktionen gav dem; fel = en orange rad; inget hittat eller ej kopplad = inga rader. */
export function analysRader(a: TraktAnalys): { text: string; farg: string | null; fel: boolean }[] {
  if (a.lage === 'fel') return [{ text: KONTROLLERA_FEL_TEXT, farg: null, fel: true }];
  if (a.lage !== 'klar') return [];
  const sedda = new Set<string>();
  return a.fynd.filter((f) => { const k = f.text.trim().toLowerCase(); if (!k || sedda.has(k)) return false; sedda.add(k); return true; })
    .map((f) => ({ text: f.text.trim(), farg: fyndFarg(f.kategori), fel: false }));
}

/** Markörerna på kartan: bara fynd med plats, en per plats och märke. */
export function analysMarkorer(objekt: readonly { id: string; namn: string; analys: TraktAnalys }[]): { nyckel: string; objektNamn: string; text: string; farg: string; lat: number; lng: number }[] {
  const ut: { nyckel: string; objektNamn: string; text: string; farg: string; lat: number; lng: number }[] = [];
  for (const o of objekt) {
    if (o.analys.lage !== 'klar') continue;
    for (const f of o.analys.fynd) {
      if (!f.plats || !Number.isFinite(f.plats.lat) || !Number.isFinite(f.plats.lng)) continue;
      const nyckel = `${o.id}|${f.text}|${f.plats.lat.toFixed(5)},${f.plats.lng.toFixed(5)}`;
      if (ut.some((m) => m.nyckel === nyckel)) continue;
      ut.push({ nyckel, objektNamn: o.namn, text: f.text.trim(), farg: fyndFarg(f.kategori), lat: f.plats.lat, lng: f.plats.lng });
    }
  }
  return ut;
}

/** Påhittad data i rätt form — för utseendet och testerna tills kopplingen finns. Används ALDRIG i appen. */
export const ANALYS_EXEMPEL: TraktAnalys = {
  lage: 'klar',
  fynd: [
    { kategori: 'barmark', text: 'Fossil åker · barmark', plats: { lat: 56.4231, lng: 15.5112 } },
    { kategori: 'vattenskydd', text: 'Vattenskydd', plats: { lat: 56.4218, lng: 15.5139 } },
    { kategori: 'skydd', text: 'Nyckelbiotop', plats: null },
  ],
};
