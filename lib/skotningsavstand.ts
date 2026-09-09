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
//  4. Maskinvyernas snittsträcka (SkotareIdagNy, SkotareOversiktNy,
//     SkotareProduktionNy, skotare.tsx) är KÖRD sträcka och halveras INTE.
//     Maskinen kör faktiskt så långt; det är prisbegreppet som är enkelriktat.
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
