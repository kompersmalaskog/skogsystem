// G15-gränsen — ENDA källan för 15-minutersgränsen mellan korta avbrott och avbrott.
//
// TERMINOLOGI (använd konsekvent i alla vyer — två OLIKA saker får aldrig heta lika):
//   "Avbrott"                — DownTime-segment ≥ 15 min (fakt_avbrott, langd_sek ≥ G15_GRANS_SEK)
//   "Korta avbrott (<15 min)"— förar-klassade DownTime-segment UNDER gränsen (fakt_avbrott,
//                              langd_sek < G15_GRANS_SEK). Det ÄR avbrott, bara korta —
//                              särredovisas alltid, ingår aldrig i avbrottstotaler,
//                              och får aldrig tyst filtreras bort.
//   "Korta pauser"           — maskinens AUTOMATISKA mikropauser (fakt_tid.kort_stopp_sek,
//                              IndividualShortDownTime). Annoteringar INUTI G15-arbetstiden
//                              (processing/terrain) — INTE additiva segment, INTE avbrott.
//
// StanForD/G15: arbetstid INKLUDERAR pauser kortare än 15 min; gränsen tillämpas av
// MASKINEN när MOM skrivs, men förare kan aktivt klassa även korta stopp som DownTime.
//
// Hårdkoda ALDRIG 900/15 min i vyer eller beräkningar — importera härifrån.
// OBS: Python-importen (skogsmaskin_import_version_6.py) kan inte importera denna
// fil; den refererar värdet i kommentar vid ShortDownTime-parsningen. Ändras
// gränsen måste båda uppdateras.
export const G15_GRANS_SEK = 900

/** Kort avbrott (< 15 min) — särredovisas, ingår inte i avbrottstotaler. */
export const arKortAvbrott = (langdSek: number) => langdSek < G15_GRANS_SEK
