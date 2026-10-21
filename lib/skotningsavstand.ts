// Skotningsavstånd — EN definition av hur fakt_lass.korstracka_m blir ett
// avstånd att räkna pris och uppföljning på.
//
// korstracka_m importeras ur StanForD-fältet DistanceFromLastUnloading
// (skogsmaskin_import_version_6.py) — sträckan maskinen kört SEDAN FÖRRA
// AVLASTNINGEN: ut till trakten, lasta, tillbaka till avlägget. TUR OCH
// RETUR. Skotningsavståndet som ackordet och kontraktet menar är
// enkelriktat, alltså HÄLFTEN.
//
// Bevisat i datan, inte antaget: de två objekt där skotavstand_manuell är
// ifyllt för hand ligger på exakt halva det volymviktade maskinvärdet
// (Brokamåla 450 mot 901/2 = 451, Tjuvön 200 mot 431/2 = 215).
//
// FYRA REGLER SOM FÖLJER AV DET:
//
//  1. dim_objekt.skotavstand_manuell är REDAN enkelriktad. Halvera den aldrig.
//
//  2. Halvera aldrig inuti acord.skotAvstandKr. Den tar emot BÅDE lass-härledda
//     och manuella avstånd — halvering där skulle halvera det manuella värdet
//     en andra gång, och göra de två objekt som är rätt idag till de enda som
//     blir fel. Funktionens parameter heter därför skotningsavstandM: signaturen
//     bär enheten så att råvärdet inte kan skickas in av misstag.
//
//  3. Halvera vid ANVÄNDNING, aldrig vid hämtning. Halveras raderna direkt
//     efter select betyder korstracka_m olika saker i olika filer — samma
//     fälla en nivå upp.
//
//  4. Maskinvyerna (?ny=1) visar SKOTNINGSAVSTÅND, aldrig rå körsträcka
//     (beslut 2026-10-21): etiketten "Skotningsavstånd" med undertexten
//     "enkel väg" överallt, värdet via den här filen. Förut stod tre
//     definitioner samtidigt — "Snittsträcka 645 m" (Översikt), "1 114 m/lass"
//     (Idag) och "halva körda sträckan" (Jämförelse) — för samma lass. Ingen vy
//     får visa rå tur-och-retur utan att säga det. Äldre maskinvy (utan ?ny=1)
//     är orörd.
//
// Anropas av: lib/ekonomi/ackordgrund (viktat snittavstånd → auto-förslaget i
// redigeringen och kolumnen i objektjämförelsen), app/ekonomi/EkonomiClient och
// lib/ekonomi/objektJamforelse (lassaggregering → pris), app/uppfoljning/lib/
// transform (raden som heter skotningsavstånd) och app/maskinvy/
// SkotareJamforelseNy (avståndsklasserna).

/** korstracka_m (tur och retur) → skotningsavstånd i meter (enkelriktat). */
export function skotningsavstandM(korstrackaM: number | null | undefined): number {
  return (Number(korstrackaM) || 0) / 2;
}

/** Etiketten och undertexten som ALLA maskinvyer använder för skotningsavstånd. */
export const SKOTNINGSAVSTAND_ETIKETT = 'Skotningsavstånd'
export const SKOTNINGSAVSTAND_UNDERTEXT = 'enkel väg'

/**
 * Snittet av skotningsavståndet över lass: summa körsträcka (tur och retur) och antal lass in,
 * enkel väg ut. Null när inget lass finns — aldrig 0.
 */
export function snittSkotningsavstandM(summaKorstrackaM: number, antalLass: number): number | null {
  return antalLass > 0 ? skotningsavstandM(summaKorstrackaM / antalLass) : null
}
