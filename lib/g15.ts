// G15-gränsen — ENDA källan för 15-minutersgränsen. TVÅ begrepp, inga fler:
//
//   "Avbrott"       — DownTime-segment ≥ 15 min (fakt_avbrott, langd_sek ≥ G15_GRANS_SEK).
//                     Det enda som visas i avbrottsvyer och räknas i avbrottstotaler.
//   "Korta pauser"  — kort icke-produktiv tid under gränsen. GÄLLER SKÖRDARE:
//                       (a) fakt_tid.kort_stopp_sek — maskinens automatiska mikropauser
//                           (IndividualShortDownTime, annoteringar INUTI G15-arbetstiden,
//                           EJ additiva mot processing/terrain), och
//                       (b) fakt_avbrott-rader < gränsen — maskingenererade övergångsglapp
//                           (empiri Scorpion 2026-04-13/17: Övrigt/Ej kategoriserat i
//                           objektbytes-/flyttskarvar; 0 väggklocke-överlapp med (a) →
//                           adderbara utan dubbelräkning). Vyer summerar (a) + (b).
//
// MASKINSLAG — splitten gäller BARA SKÖRDARE:
//   Skördare (PONS20SDJAA270231, R64101, R64428) HAR korta pauser (ShortDownTime i MOM).
//   Skotare (A030353, A110148) SAKNAR begreppet (kort_stopp_sek = 0 i verkligheten) —
//   deras fåtaliga korta DownTime (empiri A030353 18/18: 17× Unproductive terrain work
//   + 1× tankning; Unproductive = STILLESTÅND med motorn av, EngineTime=0 &
//   DrivenDistance=0, främst vid skiftstart — förarens VALDA kategori, inte körning
//   och inte oregistrerad tid) redovisas OFILTRERAT i skotarens avbrottsvy med sina
//   riktiga kategorier. Ingen split, ingen hemflytt, ingen påhittad korta
//   pauser-kategori för skotare.
//
// Hårdkoda ALDRIG 900/15 min i vyer eller beräkningar — importera härifrån.
// OBS: Python-importen (skogsmaskin_import_version_6.py) kan inte importera denna
// fil; den refererar värdet i kommentar vid ShortDownTime-parsningen. Ändras
// gränsen måste båda uppdateras.
export const G15_GRANS_SEK = 900

/** Under G15-gränsen → hör (för skördare) till "Korta pauser", inte avbrott. */
export const arKortPaus = (langdSek: number) => langdSek < G15_GRANS_SEK

// G15-tid = processing + terrain + other_work. Validerat mot FEM tillverkar-
// rapporter / 2 fabrikat: Ponsse "Effektiv tid" (Scorpion/Elefant/Wisent) och
// Rottne "Grundtid G(t)" (H8E -23/-26) är samma sak och inkluderar BÅDA övrigt
// arbete. P+T ensam underskattar 3–6 % → m³/G15h och kr/G15h överskattas. ENDA
// definitionen — vyer ska summera via denna, aldrig engine_time_sek (motortid,
// mäter dessutom bara P+T — other_work sker ofta med motorn av) eller P+T ensam.
// OBS: other_work_sek finns i fakt_tid; glöm inte fetch:a den i select:en.
export const g15Sek = (
  processing_sek: number | null | undefined,
  terrain_sek: number | null | undefined,
  other_work_sek: number | null | undefined,
) => (processing_sek || 0) + (terrain_sek || 0) + (other_work_sek || 0)

// ─────────────────────────────────────────────────────────────
// TU — TEKNISK UTNYTTJANDEGRAD, Skogforsks definition (Martins beslut
// 2026-10-01, så att talet går att jämföra utåt):
//
//   täljare = processing + terrain + avbrott kortare än 15 min
//   nämnare = täljaren + övrigt arbete (other_work) + avbrott 15 min och längre
//
// Alltså: tid med aggregat/last i arbete, delat med all tid maskinen var
// "i bruk" — arbete, övrigt arbete (vägkörning, flytt på egna hjul,
// förbereda körbanor) och ALLA avbrott oavsett kategori, inklusive flytt på
// trailer (Trailer transportation) och avbrott utan registrerad orsak.
// Rast räknas aldrig, varken i täljare eller nämnare. Tomgång och motortid
// finns inte i måttet.
//
// Avbrotten kommer ur fakt_avbrott — samma källa som Avbrott-fliken — inte
// fakt_tid:s DOWN-hinkar (de saknar segment på skördarna: Scorpion 57,8 mot
// 65,7 h sedan aug 2026). Korta avbrott (< G15_GRANS_SEK) hör till G15 per
// definition och ligger i täljaren oavsett kategori. kort_stopp_sek
// (maskinens mikropauser) ligger redan INUTI processing och rörs inte.
//
// Övrigt arbete ligger BARA i nämnaren. Därför spelar det ingen roll för TU om
// en flytt bokförs som other_work (Elefanten) eller som Trailer transportation
// (Scorpion) — talen blev jämförbara mellan maskinerna först med den här
// formeln (sedan aug 2026, räknat 2026-10-01: Rottne 92,9 · Scorpion 87,6 ·
// Wisent 90,7 · Elefanten 84,0; den gamla formeln hade flytt utanför och OW i
// täljaren). Avbrotten måste vara städade från ögonblicksbilder (#644) —
// annars ligger pågående stopp dubbelt i nämnaren.
//
// TU är ett mått på MASKINEN, inte på föraren och inte på hur lönetiden
// används — det senare är lönekvoten, ett annat tal. Se docs/tu.md.
export function tuProcent(
  arbeteSek: number,        // processing + terrain (fakt_tid)
  ovrigtArbeteSek: number,  // other_work (fakt_tid) — bara i nämnaren
  kortaAvbrottSek: number,  // fakt_avbrott < G15_GRANS_SEK, ALLA kategorier — hör till G15
  avbrottSek: number,       // fakt_avbrott alla längder, ALLA kategorier inkl. flytt — inkl. de korta
): number | null {
  const taljare = arbeteSek + kortaAvbrottSek
  const namnare = arbeteSek + ovrigtArbeteSek + avbrottSek
  if (namnare <= 0) return null
  return Math.round((taljare / namnare) * 1000) / 10
}

/** Avbrott utan registrerad orsak: controller-genererad rad där föraren inte
 *  valde någon kod (StanForD 'Default', eller tom). 'Other' och 'Unproductive
 *  terrain work' är VALDA standardkoder och räknas inte hit. Visas dämpat vid
 *  TU — talet har en osäkerhet som förarna kan åtgärda genom att klassa. */
export const arOklassatAvbrott = (kategoriKod: string | null | undefined) =>
  !kategoriKod || kategoriKod === 'Default'

/** Branschsnitt TU enligt Skogforsk (skördare 85 %, skotare 90 % — skördaren är
 *  mer tekniskt komplex). Referens i vyer som en dämpad markering, aldrig ett
 *  omdöme. Källa: Skogforsk, uppföljning av maskinutnyttjande; angivet av
 *  Joacim 2026-09-30. */
export const TU_BRANSCHSNITT = { skordare: 85, skotare: 90 } as const
