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
//   deras fåtaliga korta DownTime (empiri A030353 18/18: 17× Unproductive terrain work =
//   morgon-tomkörning ~10–14 min + 1× tankning/smörjning) redovisas OFILTRERAT i
//   skotarens avbrottsvy med sina riktiga kategorier. Ingen split, ingen hemflytt,
//   ingen påhittad korta pauser-kategori för skotare.
//
// Hårdkoda ALDRIG 900/15 min i vyer eller beräkningar — importera härifrån.
// OBS: Python-importen (skogsmaskin_import_version_6.py) kan inte importera denna
// fil; den refererar värdet i kommentar vid ShortDownTime-parsningen. Ändras
// gränsen måste båda uppdateras.
export const G15_GRANS_SEK = 900

/** Under G15-gränsen → hör (för skördare) till "Korta pauser", inte avbrott. */
export const arKortPaus = (langdSek: number) => langdSek < G15_GRANS_SEK
