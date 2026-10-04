// Objektinfo-autosparet i planeringsvyn (Fakta / Prognos / Larm): spara BARA kolumner som ändrats sedan raden laddades
// (eller sedan senaste lyckade sparning) — aldrig hela raden.
//
// Före: `saveInfoToDb` skrev ~40 kolumner ur React-state vid VARJE öppning och VARJE ändring. Tre följder:
//  1. En förares gamla värden skrev tyst över planerarens ändringar (alla fält skickades, inte bara det som ändrats).
//  2. Defaults skrevs tillbaka som om de vore uppgifter: NULL → false / '' / 'bred' / true. "Trailer in" och "bandat" blev
//     "uppgifter" på objekt ingen rört (egenkontroll och översikten läser NULL som "ingen uppgift").
//  3. State från FÖREGÅENDE objekt kunde skrivas till nästa (jsonb-fälten återställdes bara om DB-värdet fanns, och
//     infoLoaded låg kvar true vid objektbyte) — och ett misslyckat läs-anrop räknades som "laddat".
//
// Nu: laddningen översätter DB-raden till formulärvärden (`infoVardenFranRad`) och minns vad "oförändrat" betyder som
// kolumnvärden (`infoRadFranVarden` av just de värdena = baslinjen). Sparningen jämför formuläret mot baslinjen och skickar
// bara de kolumner som skiljer (`andradeKolumner`). Öppna utan att röra något = tom skillnad = ingen skrivning.
//
// Rena funktioner → enhetstestbara utan karta eller databas.

/** Kolumn → värde för objekt-raden (det som skickas i en update). */
export type InfoRad = Record<string, unknown>;

/** Formulärvärdena (samma namn som `info*`-statet i planeringsvyn). json-fälten är opaka här. */
export interface InfoVarden {
  barighet: string | null;
  terrang: string | null;
  skordareMaskinId: string | null;
  skordareUtforare: string | null;
  skordareUtforareNamn: string;
  skordareBand: boolean;
  skordareBandPar: string | null;
  skordareManFall: boolean;
  skordareManFallText: string;
  skotareMaskinId: string | null;
  skotareUtforare: string | null;
  skotareUtforareNamn: string;
  skotareBand: boolean;
  skotareBandPar: string | null;
  skotareLastreder: boolean;
  skotareRisDirekt: boolean;
  skotareExtraVagn: boolean;
  skotareKonfig: string;
  skotningsavstand: string | null;
  basvagKravs: boolean;
  basvagTimmar: string;
  trailerIn: boolean;
  transportKommentar: string;
  markagareVed: boolean;
  markagareVedText: string;
  anteckningar: string;
  prognosSettings: any;
  manuellPrognos: any;
  traktData: any;
  stickvagSettings: any;
  checklistItems: any;
  generelltTillstand: any;
  areal: string;
  volym: string;
  larmLat: string;
  larmLng: string;
  larmBeskrivning: string;
  larmKalla: 'td' | 'egen' | null;
  larmBekraftad: boolean;
}

/** Utgångsvärden för json-fälten när DB-raden saknar dem. Delas av laddaren och planeringsvyns useState → kan inte glida isär.
 *  (`traktData` volym 649 / areal 2,0 är ett gammalt demovärde som ingen läser — se PR-texten.) */
export const INFO_STANDARD = Object.freeze({
  prognosSettings: Object.freeze({ terpipirangSvar: 0, barighetDalig: 0 }),
  manuellPrognos: Object.freeze({ skordare: '', skotare: '' }),
  traktData: Object.freeze({ volym: 649, areal: 2.0 }),
  stickvagSettings: Object.freeze({ targetDistance: 25, tolerance: 3, vagbredd: 4 }),
  checklistItems: Object.freeze([
    Object.freeze({ id: 'avlagg_huggas', text: 'Behöver avlägget huggas?', answer: null, fixed: true }),
    Object.freeze({ id: 'band', text: 'Behövs band?', answer: null, fixed: true }),
    Object.freeze({ id: 'breddat', text: 'Kan skotaren köra breddat?', answer: null, fixed: true }),
    Object.freeze({ id: 'basväg_snislad', text: 'Basväg snislad?', answer: null, fixed: true }),
    Object.freeze({ id: 'gränser', text: 'Gränser markerade?', answer: null, fixed: true }),
    Object.freeze({ id: 'naturvärden', text: 'Naturvärden utmärkta?', answer: null, fixed: true }),
    Object.freeze({ id: 'kulturlämningar', text: 'Kulturlämningar kontrollerade?', answer: null, fixed: true }),
    Object.freeze({ id: 'elledningar', text: 'El-ledningar markerade?', answer: null, fixed: true }),
  ]),
  generelltTillstand: null,
});

/** Svensk decimalkomma → punkt; blankt/ogiltigt → null (aldrig smyg-0 i double-kolumnen). */
export function parseSvNum(s: string | null | undefined): number | null {
  const t = (s ?? '').replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const harVarde = (v: unknown) => v != null && v !== '' && v !== false && v !== 0;   // samma sanning som `data.x || default`

/** DB-rad → formulärvärden. Varje fält sätts ALLTID (jsonb-fälten faller tillbaka på INFO_STANDARD) så inget från ett
 *  föregående objekt blir kvar i formuläret. */
export function infoVardenFranRad(r: any): InfoVarden {
  const ellerStd = <T>(v: T | null | undefined, std: T): T => (harVarde(v) ? (v as T) : std);
  return {
    barighet: r.barighet || null,
    terrang: r.terrang || null,
    skordareMaskinId: r.skordare_maskin_id || null,
    skordareUtforare: r.skordare_utforare || null,
    skordareUtforareNamn: r.skordare_utforare_namn || '',
    skordareBand: r.skordare_band || false,
    skordareBandPar: r.skordare_band_par ?? null,
    skordareManFall: r.skordare_manuell_fallning || false,
    skordareManFallText: r.skordare_manuell_fallning_text || '',
    skotareMaskinId: r.skotare_maskin_id || null,
    skotareUtforare: r.skotare_utforare || null,
    skotareUtforareNamn: r.skotare_utforare_namn || '',
    skotareBand: r.skotare_band || false,
    skotareBandPar: r.skotare_band_par ?? null,
    skotareLastreder: r.skotare_lastreder_breddat || false,
    skotareRisDirekt: r.skotare_ris_direkt || false,
    skotareExtraVagn: r.skotare_extra_vagn || false,
    skotareKonfig: r.skotare_konfiguration || 'bred',
    skotningsavstand: r.skotningsavstand || null,
    basvagKravs: r.basvag_kravs || false,
    basvagTimmar: r.basvag_timmar != null ? String(r.basvag_timmar) : '',
    trailerIn: r.transport_trailer_in !== false,
    transportKommentar: r.transport_kommentar || '',
    markagareVed: r.markagare_ska_ha_ved || false,
    markagareVedText: r.markagare_ved_text || '',
    anteckningar: r.info_anteckningar || '',
    prognosSettings: ellerStd(r.prognos_settings, INFO_STANDARD.prognosSettings),
    manuellPrognos: ellerStd(r.manuell_prognos, INFO_STANDARD.manuellPrognos),
    traktData: ellerStd(r.trakt_data, INFO_STANDARD.traktData),
    stickvagSettings: ellerStd(r.stickvag_settings, INFO_STANDARD.stickvagSettings),
    checklistItems: ellerStd(r.checklist_items, INFO_STANDARD.checklistItems),
    generelltTillstand: ellerStd(r.generellt_tillstand, INFO_STANDARD.generelltTillstand),
    areal: r.areal != null ? String(r.areal) : '',
    volym: r.volym != null ? String(r.volym) : '',
    larmLat: r.larmkoordinat_lat != null ? String(r.larmkoordinat_lat) : '',
    larmLng: r.larmkoordinat_lng != null ? String(r.larmkoordinat_lng) : '',
    larmBeskrivning: r.larmkoordinat_beskrivning || '',
    larmKalla: r.larmkoordinat_kalla || null,
    larmBekraftad: r.larmkoordinat_bekraftad || false,
  };
}

/** Formulärvärden → kolumnvärden (det som en sparning skulle skriva). Samma översättning som den gamla `saveInfoToDb`. */
export function infoRadFranVarden(v: InfoVarden): InfoRad {
  return {
    barighet: v.barighet,
    terrang: v.terrang,
    // Maskin/utförare: id/utförare-kolumnerna (invarianten maskin_id XOR utförare hålls av väljar-handlarna).
    skordare_maskin_id: v.skordareMaskinId,
    skordare_utforare: v.skordareUtforare,
    skordare_utforare_namn: v.skordareUtforare === 'extern' ? (v.skordareUtforareNamn || null) : null,
    skordare_band: v.skordareBand,
    // Band och par får inte säga emot varandra: av = antalet par är ingen uppgift (null, aldrig en etta).
    skordare_band_par: v.skordareBand ? v.skordareBandPar : null,
    skordare_manuell_fallning: v.skordareManFall,
    skordare_manuell_fallning_text: v.skordareManFallText || null,
    skotare_maskin_id: v.skotareMaskinId,
    skotare_utforare: v.skotareUtforare,
    skotare_utforare_namn: v.skotareUtforare === 'extern' ? (v.skotareUtforareNamn || null) : null,
    skotare_band: v.skotareBand,
    skotare_band_par: v.skotareBand ? v.skotareBandPar : null,
    skotare_lastreder_breddat: v.skotareLastreder,
    skotare_ris_direkt: v.skotareRisDirekt,
    skotare_extra_vagn: v.skotareExtraVagn,
    skotare_konfiguration: v.skotareKonfig,
    skotningsavstand: v.skotningsavstand,
    basvag_kravs: v.basvagKravs,
    basvag_timmar: v.basvagKravs ? parseSvNum(v.basvagTimmar) : null,
    transport_trailer_in: v.trailerIn,
    transport_kommentar: v.transportKommentar || null,
    markagare_ska_ha_ved: v.markagareVed,
    markagare_ved_text: v.markagareVedText || null,
    info_anteckningar: v.anteckningar || null,
    prognos_settings: v.prognosSettings,
    manuell_prognos: v.manuellPrognos,
    trakt_data: v.traktData,
    stickvag_settings: v.stickvagSettings,
    checklist_items: v.checklistItems,
    generellt_tillstand: v.generelltTillstand,
    areal: parseSvNum(v.areal),
    volym: parseSvNum(v.volym),
    larmkoordinat_lat: parseSvNum(v.larmLat),
    larmkoordinat_lng: parseSvNum(v.larmLng),
    larmkoordinat_beskrivning: v.larmBeskrivning || null,
    larmkoordinat_kalla: v.larmKalla,
    larmkoordinat_bekraftad: v.larmBekraftad,
  };
}

/** Kolumner som sparas — i samma ordning som `infoRadFranVarden`. */
export const INFO_KOLUMNER: string[] = Object.keys(infoRadFranVarden(infoVardenFranRad({})));

/** Djup jämförelse: nyckelordning spelar ingen roll (jsonb ordnar om nycklar), `undefined` räknas som saknad nyckel. */
export function djupLika(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => djupLika(x, b[i]));
  const ka = Object.keys(a as object).filter((k) => (a as any)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as any)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && djupLika((a as any)[k], (b as any)[k]));
}

/** Tidsstämplar i den APP-BERÄKNADE cachen (trakt_data.beraknad). En omkörning som ger samma resultat byter bara dessa. */
const TIDSNYCKLAR = new Set(['beraknadAt', 'restriktionerAnalyseradAt', 'at']);
export function utanTidsstamplar(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(utanTidsstamplar);
  if (x && typeof x === 'object') {
    const ut: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as object)) if (!TIDSNYCKLAR.has(k)) ut[k] = utanTidsstamplar(v);
    return ut;
  }
  return x;
}

/** Kolumner där `nu` skiljer sig från baslinjen `bas`. `trakt_data` är appens egen analys-cache: jämförs utan tidsstämplar,
 *  så en omkörning med samma resultat inte räknas som ändring. Allt annat är användarens fält. */
export function andradeKolumner(bas: InfoRad, nu: InfoRad): InfoRad {
  const ut: InfoRad = {};
  for (const [kol, v] of Object.entries(nu)) {
    const lika = kol === 'trakt_data'
      ? djupLika(utanTidsstamplar(bas[kol]), utanTidsstamplar(v))
      : djupLika(bas[kol], v);
    if (!lika) ut[kol] = v;
  }
  return ut;
}

/** Efter en sparning: vilka av de skickade kolumnerna kom INTE tillbaka med samma värde? Radräkning bevisar bara att en rad
 *  rördes — inte att värdet landade. Tom lista = allt landade. */
export function kolumnerSomInteLandade(skickat: InfoRad, tillbaka: Record<string, unknown> | null | undefined): string[] {
  if (!tillbaka) return Object.keys(skickat);
  return Object.keys(skickat).filter((kol) => !djupLika(skickat[kol], tillbaka[kol]));
}
