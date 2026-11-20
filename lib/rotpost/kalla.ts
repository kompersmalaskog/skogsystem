// VILKA TRAKTER ÄR ROTPOSTER, OCH VAR LIGGER DERAS STÄMPLINGSLÄNGD — en källa för listan, sidan och läs-routen.
//
// Rotpost: avtalsformen säger Rp (på objektet eller i dim_objekt) ELLER Vidas namn säger "RP" ("Skälviken RP J-Hus -25").
// Avtalsformen fylls bara för trakter importerade efter att importen lärt sig läsa Ursprung (2026-10-14) och kan vara rättad
// för hand; namnet sätter Vida vid köpet. Ett av dem räcker.
//
// Stämplingslängden: den PDF importen kände igen på namnet (objekt.stamplingslangd_url). Saknas den men trakten har EXAKT EN
// övrig PDF som inte är en karta eller ett traktdirektiv, är det den — inskannade stämplingslängder heter som trakten
// ("Mölleryd.pdf") och fastnar som övrigt dokument. Den räknas som gissad; läsningen avgör (en annan sorts PDF går inte
// att läsa som stämplingslängd och säger det).

export type Dokument = { namn?: string | null; path?: string | null };

const RE_RP = /(^|[\s(-])rp([\s)-]|$)/i;
const RE_KARTA_ELLER_TD = /_(ÖK|ÖK|\d*_?TK|TD)\.pdf$/i;

export function arRotpost(o: { namn?: string | null; avtalsform?: string | null; dimAvtalsform?: string | null }): boolean {
  const af = (s?: string | null) => (s ?? '').trim().toLowerCase() === 'rp';
  return af(o.avtalsform) || af(o.dimAvtalsform) || RE_RP.test(o.namn ?? '');
}

export type StamplingsKalla = { path: string; gissad: boolean } | null;

export function stamplingsKalla(o: { stamplingslangd_url?: string | null; ovriga_dokument?: Dokument[] | null }): StamplingsKalla {
  if (o.stamplingslangd_url) return { path: o.stamplingslangd_url, gissad: false };
  const kandidater = (o.ovriga_dokument ?? []).filter(d =>
    d.path && /\.pdf$/i.test(d.path) && !RE_KARTA_ELLER_TD.test((d.namn ?? '').normalize('NFC')));
  return kandidater.length === 1 ? { path: kandidater[0].path as string, gissad: true } : null;
}

export type ObjektMedDokument = {
  vo_nummer: string | null; namn: string | null; avtalsform: string | null;
  stamplingslangd_url?: string | null; ovriga_dokument?: Dokument[] | null;
};

/** Trakterna vars stämplingslängd ska läsas automatiskt: har en stämplingslängd och ingen rapport än (oavsett status — en
 *  misslyckad läsning görs om med knappen, aldrig av sig själv, så ingen läsning kostar om och om igen). En GISSAD stämplingslängd
 *  (ensam inskannad PDF) läses bara på en rotpost — på en gallring är en ensam PDF något annat. Äldst VO-nummer först. */
export function attLasa(objekt: ObjektMedDokument[], dimAvtalsform: Map<string, string | null>, harRapport: Set<string>): string[] {
  const ut: string[] = [];
  for (const o of objekt) {
    const id = o.vo_nummer;
    if (!id || harRapport.has(id)) continue;
    const k = stamplingsKalla(o);
    if (!k) continue;
    if (k.gissad && !arRotpost({ namn: o.namn, avtalsform: o.avtalsform, dimAvtalsform: dimAvtalsform.get(id) })) continue;
    ut.push(id);
  }
  return ut.sort();
}
