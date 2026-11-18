// Appens lass för EN trakt, som underlag till skotningsavståndet.
//
// Skild från lib/skotarLass/lasServer (som läser med webbläsarklienten för
// planeringsvyn): fakturan körs på servern och får sin klient inskickad, som
// allt annat i lib/faktura/hamtaUnderlag.
//
// AVSTÅNDET KOMMER UR HYTTSPÅRET, inte ur `skotar_lass.spar`. Lassets egen
// spårkopia saknar utturen — i snitt 279 m per lass på Skälviken, 75 av 84
// lass fattar mer än 50 m. SQL-funktionen `skotar_lass_cykel` (migration
// 20261118100350) räknar cykeln ur `hyttspar`, som har punkterna, och lagar
// därmed historiken utan att något skrivs om. Se lib/faktura/lassCykel.
//
// BARA KLAR RÄKNAS — `status = 'bekraftat'` och `bekraftad_av <> 'auto'`,
// exakt samma urval som `raknasSomSkotat` (lib/skotarLass/lassModell) och som
// helikoptern. Obesvarade, strukna och de gamla självbekräftade lassen får
// aldrig bära pengar. Urvalet görs i SQL-funktionen.
//
// ETT LÄSFEL ÄR ETT FEL. Funktionen kastar i stället för att svara med en tom
// lista: en tyst nolla här blir ett avståndstillägg på 0 kr som ser mätt ut.
//
// ENDA undantaget är att funktionen inte FINNS (migrationen inte körd). Då
// svarar den `tillganglig: false` och underlaget lägger en VARNING — för
// tystnaden går åt FEL håll: utan appens lass vinner Optis, och på Skälviken
// är Optis två lass (858 och 1 538 m enkel väg) mycket längre än cykeln ur
// hyttspåret. Avståndet hade blivit 1 198 m i stället för 739, alltså för
// HÖGT. En sådan faktura ska aldrig gå till Vida utan att det står varför.

import { cykelTillAvstandsLass, type CykelSkal, type LassCykel } from '@/lib/faktura/lassCykel';
import type { AvstandsLass } from '@/lib/faktura/lassAvstand';

type SB = { rpc: (namn: string, args: Record<string, unknown>) => any };

export type LasCykelSvar = {
  rader: LassCykel[];
  /**
   * false = SQL-funktionen finns inte (migrationen inte körd). Då finns inga
   * app-lass, och underlaget MÅSTE säga det: utan dem bär Optis lass
   * avståndet ensamma, och det kan bli för högt — aldrig tyst.
   */
  tillganglig: boolean;
};

const SKAL: ReadonlySet<string> = new Set<CykelSkal>([
  'ok', 'forsta_lasset', 'fonster_for_langt', 'inga_punkter', 'saknar_lossning',
]);

/** Saknad funktion (migrationen inte körd), inte ett riktigt läsfel. */
function funktionenSaknas(fel: { code?: string; message?: string }): boolean {
  return fel.code === 'PGRST202' || fel.code === '42883'
    || /could not find the function|does not exist/i.test(fel.message || '');
}

function tal(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lasscykeln per app-lass under något av traktens nummer.
 *
 * `nummer` ska vara traktens VO PLUS dess dim-objekt-id:n och extra nummer —
 * samma fälla som `extra_tid.objekt_id` och produktionshögarna: ett lass kan
 * ligga under ett annat av traktens nummer än det vi slog upp på (Mölleryd
 * har 11271883 och 11166477). Att läsa på ett nummer tappar lassen TYST.
 */
export async function lasLassCykel(sb: SB, nummer: string[]): Promise<LasCykelSvar> {
  const unika = Array.from(new Set(nummer.filter(Boolean)));
  if (!unika.length) return { rader: [], tillganglig: true };

  const { data, error } = await sb.rpc('skotar_lass_cykel', { p_vo: unika });

  if (error) {
    if (!funktionenSaknas(error)) {
      throw new Error('Kunde inte läsa skotarlassens cykel: ' + error.message);
    }
    // Funktionen finns inte. Inga app-lass alls — och det MÅSTE sägas, för då
    // bär Optis lass avståndet ensamma och talet kan bli för högt.
    return { rader: [], tillganglig: false };
  }

  const rader = (data || []).map((r: any): LassCykel => ({
    lassId: String(r.lass_id),
    voNummer: r.vo_nummer ?? null,
    maskinId: r.maskin_id ?? null,
    datum: String(r.datum),
    volym: tal(r.volym) ?? 0,
    cykelM: tal(r.cykel_m),
    punkter: tal(r.punkter),
    vidAvlaggetM: tal(r.vid_avlagget_m),
    hemMedLassM: tal(r.hem_med_lass_m),
    ytterstM: tal(r.ytterst_m),
    skal: SKAL.has(r.skal) ? (r.skal as CykelSkal) : 'inga_punkter',
  }));

  return { rader, tillganglig: true };
}

/** Samma lass som `lasLassCykel`, med avståndet som enkel väg. */
export async function lasAppLass(sb: SB, nummer: string[]): Promise<AvstandsLass[]> {
  return cykelTillAvstandsLass((await lasLassCykel(sb, nummer)).rader);
}
