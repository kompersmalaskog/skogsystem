// Appens lass för EN trakt, som underlag till skotningsavståndet.
//
// Skild från lib/skotarLass/lasServer (som läser med webbläsarklienten för
// planeringsvyn): fakturan körs på servern och får sin klient inskickad, som
// allt annat i lib/faktura/hamtaUnderlag.
//
// BARA KLAR RÄKNAS — `status = 'bekraftat'` och `bekraftad_av <> 'auto'`,
// exakt samma urval som `raknasSomSkotat` (lib/skotarLass/lassModell) och som
// helikoptern. Obesvarade, strukna och de gamla självbekräftade lassen får
// aldrig bära pengar.
//
// ETT LÄSFEL ÄR ETT FEL. Funktionen kastar i stället för att svara med en tom
// lista: en tyst nolla här blir ett avståndstillägg på 0 kr som ser mätt ut.

import { fetchAllRows } from '@/lib/ekonomi/period';
import { sparAvstandM, type AvstandsLass, type SparPunkt } from '@/lib/faktura/lassAvstand';

type SB = { from: (t: string) => any };

/**
 * Appens bekräftade lass under något av traktens nummer.
 *
 * `nummer` ska vara traktens VO PLUS dess dim-objekt-id:n och extra nummer —
 * samma fälla som `extra_tid.objekt_id` och produktionshögarna: ett lass kan
 * ligga under ett annat av traktens nummer än det vi slog upp på (Mölleryd
 * har 11271883 och 11166477). Att läsa på ett nummer tappar lassen TYST.
 */
export async function lasAppLass(sb: SB, nummer: string[]): Promise<AvstandsLass[]> {
  const unika = Array.from(new Set(nummer.filter(Boolean)));
  if (!unika.length) return [];

  const lass = await fetchAllRows((f, t) => sb.from('skotar_lass')
    .select('id, maskin_id, datum, spar')
    .in('vo_nummer', unika)
    .eq('status', 'bekraftat')
    .neq('bekraftad_av', 'auto')
    .order('datum').order('id').range(f, t));

  if (!lass.length) return [];

  // Volymen bor i sortimentraderna — förarens egna m³, oskalade (se
  // lib/faktura/lassAvstand om varför Färdigskotad-faktorn inte används här).
  const ids = lass.map((l: any) => l.id);
  const rader = await fetchAllRows((f, t) => sb.from('skotar_lass_sortiment')
    .select('lass_id, m3_forare').in('lass_id', ids)
    .order('lass_id').order('del_nr').range(f, t));

  const volymPerLass = new Map<string, number>();
  for (const r of rader) {
    volymPerLass.set(r.lass_id, (volymPerLass.get(r.lass_id) || 0) + (Number(r.m3_forare) || 0));
  }

  return lass.map((l: any) => ({
    datum: String(l.datum),
    maskinId: l.maskin_id ?? null,
    avstandM: sparAvstandM(l.spar as SparPunkt[] | null),
    volym: volymPerLass.get(l.id) || 0,
    kalla: 'app' as const,
  }));
}
