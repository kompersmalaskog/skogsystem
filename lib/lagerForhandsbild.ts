// Liten förhandsbild per lagerrad i plusarkets Lager-flik: en stiliserad färgyta (CSS-bakgrund), inte en riktig kartruta —
// ingen nätverkshämtning, fungerar utan täckning i hytten. Färgen följer lagrets egen färg (LayerDef.color) där den finns.

const NEUTRAL = 'linear-gradient(135deg, #3a3a3c, #636366)';

/** Bakgrundskartorna: en färgyta som liknar kartan (karta dämpad, flygfoto, topokarta, OpenStreetMap). */
export const BASKARTA_BILD: Readonly<Record<string, string>> = {
  lantmateriet: 'linear-gradient(135deg, #d9dbd6, #c4c7c1)',
  satellite: 'linear-gradient(135deg, #3d5a36, #6b7d4a, #2f4a2a)',
  terrain: 'linear-gradient(135deg, #e8e4cf, #a9bd8e, #d8c9a0)',
  osm: 'linear-gradient(135deg, #f2efe9, #aad3df)',
};

/** Lager som inte kommer ur LayerDef (overlayLista i sidan): en färg per id. */
const OVERLAY_FARG: Readonly<Record<string, string>> = {
  vidaKartbild: '#d8c79a',
  hansyn: '#ffd60a',
  traktNyckelbiotop: '#a855f7',
  traktLamning: '#ff453a',
  korFara: '#f59e0b',
  wetlands: '#3b82f6',
  produktionshogar: '#2d6a4f',
  grothogar: '#f59e0b',
  brandrisk: '#f97316',
  prickar: '#d6b98c',
};

const arHex6 = (c: string): boolean => /^#[0-9a-f]{6}$/i.test(c);

/** En färg → en diskret tonad yta (ljus i ena hörnet, full färg i det andra). Annat än #rrggbb används rakt av. */
export function tonadYta(farg: string): string {
  return arHex6(farg) ? `linear-gradient(135deg, ${farg}40, ${farg})` : farg;
}

/** Randig yta för linjer med två färger (traktgräns, basväg) — eller en enfärgad. */
export function linjeYta(farg: string, farg2?: string): string {
  return farg2 ? `repeating-linear-gradient(45deg, ${farg} 0 5px, ${farg2} 5px 10px)` : farg;
}

/** Ett spår: en diagonal strimma i spårets färg. */
export function sparYta(farg: string): string {
  return `linear-gradient(135deg, transparent 40%, ${farg} 40% 60%, transparent 60%), #2c2c2e`;
}

/** Förhandsbild för ett lager. `farg` = lagrets egen färg om den finns. */
export function lagerBild(id: string, farg?: string): string {
  if (BASKARTA_BILD[id]) return BASKARTA_BILD[id];
  const c = farg ?? OVERLAY_FARG[id];
  return c ? tonadYta(c) : NEUTRAL;
}
