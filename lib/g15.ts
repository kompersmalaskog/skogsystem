// G15-gränsen — ENDA källan för 15-minutersgränsen. TVÅ begrepp, inga fler:
//
//   "Avbrott"       — DownTime-segment ≥ 15 min (fakt_avbrott, langd_sek ≥ G15_GRANS_SEK).
//                     Det enda som visas i avbrottsvyer och räknas i avbrottstotaler.
//   "Korta pauser"  — ALL kort icke-produktiv tid under gränsen, oavsett hur maskinen
//                     registrerade den:
//                       (a) fakt_tid.kort_stopp_sek — maskinens automatiska mikropauser
//                           (IndividualShortDownTime, annoteringar INUTI G15-arbetstiden,
//                           EJ additiva mot processing/terrain), och
//                       (b) fakt_avbrott-rader < gränsen — maskingenererade övergångsglapp
//                           (empiri 2026-04-13/17 Scorpion: alla var Övrigt/Ej kategoriserat
//                           i objektbytes-/flyttskarvar; 0 väggklocke-överlapp med (a) →
//                           väggklocke-separata och därmed ADDERBARA utan dubbelräkning).
//                     Vyer som visar Korta pauser summerar (a) + (b) — hemflytt, inte
//                     tyst filtrering.
//
// Det finns alltså INGEN egen kategori "korta avbrott" — DownTime under gränsen är samma
// fenomen som korta pauser och redovisas där.
//
// Hårdkoda ALDRIG 900/15 min i vyer eller beräkningar — importera härifrån.
// OBS: Python-importen (skogsmaskin_import_version_6.py) kan inte importera denna
// fil; den refererar värdet i kommentar vid ShortDownTime-parsningen. Ändras
// gränsen måste båda uppdateras.
export const G15_GRANS_SEK = 900

/** Under G15-gränsen → hör till "Korta pauser", inte avbrott. */
export const arKortPaus = (langdSek: number) => langdSek < G15_GRANS_SEK
