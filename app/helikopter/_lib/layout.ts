// /helikopter — layoutmått som delas mellan sidorna. Ren logik: inget här vet något om React eller DOM.
//
// Själva helikoptersidan (/helikopter) har sedan 2026-10-23 inga lägen: korten ligger i ett rutnät med container queries
// (1/2/3 kolumner från 640/960 px av sidans bredd) och månaderna står som sidokolumn från 1100 px — se HelikopterVy.tsx.
// Det som är kvar här är veckovyns mått.

/** /helikopter/veckor: båda spåren sida vid sida från och med den här bredden. */
export const VECKOR_TVA_SPAR_MIN_PX = 900
/** Layoutmått: /helikopter/veckor, max bredd per spår när båda visas. */
export const SPAR_MAX_PX = 480
