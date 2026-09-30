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
// TU — TEKNISK UTNYTTJANDEGRAD (Skogforsk). Branschens standardmått för
// maskinen: hur stor del av den utnyttjade tiden som är grundtid.
//
//   TU = G15 / U-tid,  U-tid = G15 + avbrott
//
// G15 räknar per definition IN avbrott kortare än 15 min. fakt_tid:s DOWN-hinkar
// (maintenance/disturbance/avbrott_sek) innehåller avbrott av alla längder, så
// den korta delen (fakt_avbrott-rader med langd_sek < G15_GRANS_SEK) flyttas
// över till täljaren. kort_stopp_sek ligger redan INUTI G15 och rörs inte.
// Rast (rast_sek) är utanför både G15 och avbrott — aldrig i nämnaren. Tomgång
// finns inte i StanForD och räknas inte.
//
// TU är ett mått på MASKINEN (underhåll, störning, reparation), inte på föraren
// och inte på hur lönetiden används — det senare är lönekvoten (maskintid per
// lönetimme), ett annat tal. Se docs/tu.md.
//
// Empiri sep 2026 (sedan 1 aug): rast i nämnaren drog ner skördarna 4–6 enheter
// (Scorpion 82,1 → 86,4). Två enheter TU ≈ 8 % vinst vid 3 000 timmar/år (Martin).
export function tuProcent(
  g15Sek: number,
  kortaAvbrottSek: number, // fakt_avbrott < G15_GRANS_SEK — hör till G15
  avbrottSek: number,      // alla DOWN ur fakt_tid (maintenance + disturbance + avbrott)
): number | null {
  const taljare = g15Sek + kortaAvbrottSek
  const namnare = g15Sek + avbrottSek
  if (namnare <= 0) return null
  return Math.round((taljare / namnare) * 1000) / 10
}

/** Branschsnitt TU enligt Skogforsk (skördare 85 %, skotare 90 % — skördaren är
 *  mer tekniskt komplex). Referens i vyer som en dämpad markering, aldrig ett
 *  omdöme. Källa: Skogforsk, uppföljning av maskinutnyttjande; angivet av
 *  Joacim 2026-09-30. */
export const TU_BRANSCHSNITT = { skordare: 85, skotare: 90 } as const
