// FLYGFOTOTS RUTSTORLEK — skarpare bild på skärmar med hög upplösning (Martin 2026-11-22: flygfotot upplevdes mörkt och suddigt jämfört med FL).
//
// MapLibre ber om en 256-ruta och drar ut den på skärmen. På en telefon (3 bildpunkter per punkt) blir varje kartbildpunkt nästan tre skärmpunkter stor —
// det är det som ser suddigt ut. Lösningen är att be Lantmäteriet om 512 × 512 för SAMMA markyta (kartans `tileSize` är fortfarande 256, zoomnivåerna och
// `maxzoom: 18` är oförändrade): fyra gånger så många bildpunkter per ruta, ungefär dubbel upplösning.
//
// BARA när skärmen har det: `devicePixelRatio >= RETINA_FRAN_DPR`. Maskindatorerna (DPR 1, och Windows 125 % = 1,25) får exakt samma adresser, samma
// bilder och samma trafik som förut. Tröskeln är 1,5 och inte "större än 1" just för skalningen på Windows: en maskindator på 125 % ska inte få mer trafik.
//
// 512-rutorna hämtas som JPEG, inte PNG: ett flygfoto är ett foto. Uppmätt på Gallring Santhe (zoom 16): 256 PNG 148 kB, 512 PNG 591 kB (4 ×), 512 JPEG 71 kB.
// Med PNG hade varje vy blivit fyra gånger tyngre; med JPEG blir den lättare än förut. Proxyn (`/api/forarkarta`) tar `s=512` och väljer format själv.
//
// Adressen är också nyckeln i enhetens kartcache (service workern, "Ladda ner trakten"): kartan och nedladdningen MÅSTE använda samma mall, därför bor den här.

/** Från vilken skärmtäthet 512-rutor används. */
export const RETINA_FRAN_DPR = 1.5;

/** Rutstorlek (bildpunkter) som begärs från proxyn på en vanlig skärm. */
export const FLYGFOTO_RUTA_PX = 256;
/** Rutstorlek på en skärm med hög upplösning. */
export const FLYGFOTO_RUTA_PX_RETINA = 512;

/** Flygfotots rutadress för en vanlig skärm (den som alltid gällt). */
export const FLYGFOTO_MALL = '/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}';
/** …och för en skärm med hög upplösning. */
export const FLYGFOTO_MALL_RETINA = `${FLYGFOTO_MALL}&s=${FLYGFOTO_RUTA_PX_RETINA}`;

/** Enhetens skärmtäthet nu (1 när den inte går att läsa, t.ex. på servern). */
export function skarmDpr(): number {
  try {
    const d = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 1;
  } catch { return 1; }
}

/** Ska 512-rutor användas på en skärm med den här täthet? */
export const arRetina = (dpr: number = skarmDpr()): boolean => Number.isFinite(dpr) && dpr >= RETINA_FRAN_DPR;

/** Flygfotots rutadress för skärmens täthet. */
export const flygfotoMall = (dpr: number = skarmDpr()): string => (arRetina(dpr) ? FLYGFOTO_MALL_RETINA : FLYGFOTO_MALL);
