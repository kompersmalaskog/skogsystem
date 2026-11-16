// SKOTNINGSAVSTÅNDET: lassen som bär det, ur BÅDA källorna.
//
// VARFÖR DEN FINNS (Martin 2026-11-16: "hur funkar skotningsavståndet för
// daniel har ju registrerat lassen i appen")
//
// Fakturan läste bara `fakt_lass` — Optis filer. Elefanten rapporterar lass i
// APPEN sedan 20 oktober, och de ligger i `skotar_lass` med GPS-spår per lass.
// De lassen var alltså osynliga för avståndstillägget. Uppmätt i prod
// 2026-11-16:
//
//   Skälviken   85 app-lass (1 553 m³, 90 % av trakten)  mot  2 Opti-lass (40 m³, 2 %)
//   Mölleryd    38 app-lass (779 m³)                     mot  8 Opti-lass
//   Arvidstorp  14 app-lass (280 m³)                     mot  0
//
// Skälvikens två Opti-lass (858 och 1 538 m enkel väg) är LÄNGRE än samtliga
// 85 app-lass (40–672 m, volymviktat 382 m). Tillägget går från 1 680 kr till
// 14 416 kr när appens lass räknas — och ett avstånd gissat ur de två
// Opti-lassen hade blivit fem gånger för högt.
//
// ─────────────────────────────────────────────────────────────────────────
// TVÅ REGLER, INGEN NY PRISMODELL
//
//   1. ALDRIG DUBBELT. Samma dags skotning kan finnas i båda källorna — det
//      är samma lass sett från två håll. Per maskin och svensk DAG vinner den
//      källa som har mest volym, aldrig summan. Exakt samma regel som
//      helikoptern använder för skotat (vyn `helikopter_lass`), så det finns
//      inte två sätt att väga Opti mot appen.
//
//   2. PRISET RÄKNAS PER LASS, som förut. `skotAvstandKr` summeras på
//      LASSETS egen volym; den här filen levererar bara fler lass att summera
//      över. Ingen ny viktning, ingen ny avrundning.
//
// Appens volym är förarens egna m³, OSKALADE — `skotar_trakt_avslut`-faktorn
// (Färdigskotad) används med flit inte här: den finns för att stämma av
// traktens TOTALA volym, och ett avståndstillägg ska inte ändras av att någon
// trycker en knapp. Att lassen inte täcker hela trakten säger täckningsraden
// i "Vad behöver du kolla?" (lib/faktura/fattas).
// ─────────────────────────────────────────────────────────────────────────

import { pathMeters } from '@/lib/geoMat';
import { skotningsavstandM } from '@/lib/skotningsavstand';

export type Lasskalla = 'opti' | 'app';

/** Ett lass som kan bära avståndstillägg. `avstandM` är ENKEL VÄG. */
export type AvstandsLass = {
  /** Svensk dag — nyckeln som Opti och appen jämförs på. */
  datum: string;
  /** null = okänd maskin; ett sådant lass jämförs i sin egen grupp. */
  maskinId: string | null;
  /**
   * Skotningsavstånd enkel väg. null = lasset har ingen mätt sträcka och
   * bidrar därför med 0 kr — men räknas ändå när källorna vägs mot varandra.
   */
  avstandM: number | null;
  volym: number;
  kalla: Lasskalla;
};

/** En punkt i appens sparade spår. */
export type SparPunkt = { lat: number; lng: number };

/**
 * Spårets längd → skotningsavstånd enkel väg.
 *
 * `spar` är appens punkter sedan förra lossningen: ut i trakten, lasta,
 * tillbaka till avlägget — samma sak som Optis `DistanceFromLastUnloading`.
 * Därför halveras det med SAMMA funktion (lib/skotningsavstand), aldrig med
 * en egen division. Färre än två punkter är ingen sträcka: null, inte 0 —
 * noll ser ut som ett mätt kort avstånd.
 */
export function sparAvstandM(spar: SparPunkt[] | null | undefined): number | null {
  if (!Array.isArray(spar) || spar.length < 2) return null;
  const koord = spar
    .filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
    .map(p => [p.lng, p.lat] as [number, number]);
  if (koord.length < 2) return null;
  return skotningsavstandM(pathMeters(koord));
}

/** Gruppnyckeln: maskin + svensk dag. Okänd maskin får sin egen grupp. */
function nyckel(l: AvstandsLass): string {
  return `${l.maskinId ?? '(okänd)'}|${l.datum}`;
}

/**
 * Opti mot appen: per maskin och dag vinner källan med mest volym.
 *
 * Volymen räknas på ALLA lass i källan den dagen, också de utan mätt sträcka —
 * ett lass utan spår är fortfarande ett lass som kördes, och ska väga när man
 * avgör vilken källa som beskriver dagen bäst. Ur den vinnande källan går
 * sedan bara de lass vidare som har en sträcka; resten bidrar med 0 kr,
 * precis som ett Opti-lass utan korstracka alltid har gjort.
 *
 * LIKA VOLYM: Opti vinner. Det är maskinens egen mätning och den källa
 * historiken är byggd på — appens m³ är förarens uppskattning.
 */
export function valjLassKalla(lass: AvstandsLass[]): AvstandsLass[] {
  const grupper = new Map<string, AvstandsLass[]>();
  for (const l of lass) {
    const k = nyckel(l);
    const g = grupper.get(k);
    if (g) g.push(l); else grupper.set(k, [l]);
  }

  const valda: AvstandsLass[] = [];
  for (const g of Array.from(grupper.values())) {
    const volym = (k: Lasskalla) =>
      g.reduce((s, l) => s + (l.kalla === k ? l.volym : 0), 0);
    const harApp = g.some(l => l.kalla === 'app');
    const harOpti = g.some(l => l.kalla === 'opti');
    // Bara en källa den dagen: den gäller, oavsett volym.
    const vinnare: Lasskalla = !harApp ? 'opti'
      : !harOpti ? 'app'
      : volym('app') > volym('opti') ? 'app' : 'opti';
    for (const l of g) if (l.kalla === vinnare) valda.push(l);
  }
  return valda;
}

/** Vad som faktiskt bär tillägget: lassen ur den valda källan som HAR sträcka. */
export function lassMedStracka(valda: AvstandsLass[]): AvstandsLass[] {
  return valda.filter(l => (l.avstandM ?? 0) > 0);
}

/**
 * Vilka källor tillägget vilar på, för granskningen. Tom lista = inga lass.
 * Säger VAD talet bygger på utan att vyn behöver räkna om något.
 */
export function kallorIOrd(valda: AvstandsLass[]): Lasskalla[] {
  const k = new Set(lassMedStracka(valda).map(l => l.kalla));
  return (['app', 'opti'] as Lasskalla[]).filter(x => k.has(x));
}
