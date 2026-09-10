// Kapacitet: hur många skotare en skördare sysselsätter.
//
//   kvot = skotning-G15 / skörd-G15   (timmar via lib/g15, aldrig motortid)
//
// Talet visas ALDRIG som rå kvot ("1,4×" säger ingenting i hytten). Det
// rundas till begripliga halvsteg — ½, 1, 1½, 2 … — och läses som
// "1½ skotare per skördare", med en stödrad i klockspråk:
// "1 h 24 min skotning per timme skörd". Prod 2026-09-10 på färdiga objekt:
// gallring ~0,6 (½ skotare), slutavverkning ~1,4 (1½ skotare).
//
// EN källa för både objektdetaljen (uppföljningen) och periodvyn (maskinvyn).
// Uteslutningsreglerna (extern, vindfälle, manuell, opålitlig period) läggs
// här i etapp 2 — inte i vyerna.

/** Kvoten, eller null när någon av tiderna saknas — då finns inget att säga. */
export function kapacitetKvot(skordG15h: number | null | undefined, skotningG15h: number | null | undefined): number | null {
  if (!skordG15h || !skotningG15h || skordG15h <= 0 || skotningG15h <= 0) return null;
  return skotningG15h / skordG15h;
}

/** Närmaste halvsteg (0,5 · 1 · 1,5 · 2 …). Under 0,25 → 0, som texten läser "under ½". */
export function kapacitetHalvsteg(kvot: number): number {
  return Math.round(kvot * 2) / 2;
}

/** 0,5 → "½", 1 → "1", 1,5 → "1½", 2 → "2", 2,5 → "2½". */
export function halvstegText(steg: number): string {
  const hel = Math.floor(steg);
  const halv = steg - hel >= 0.5;
  if (hel === 0) return halv ? '½' : '0';
  return halv ? `${hel}½` : `${hel}`;
}

/** "1 h 24 min" / "36 min" / "2 h" — minuter skotning per timme skörd. */
export function minuterPerTimmeText(kvot: number): string {
  const min = Math.round(kvot * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export type KapacitetKlarsprak = {
  /** Huvudtalet, t.ex. "1½" eller "under ½". */
  tal: string;
  /** Huvudtalets efterled: "skotare per skördare". */
  enhet: string;
  /** Hela huvudraden: "1½ skotare per skördare". */
  huvud: string;
  /** Stödraden: "1 h 24 min skotning per timme skörd". */
  stod: string;
};

export function kapacitetKlarsprak(kvot: number): KapacitetKlarsprak {
  const steg = kapacitetHalvsteg(kvot);
  const tal = steg < 0.5 ? 'under ½' : halvstegText(steg);
  const enhet = 'skotare per skördare';
  return {
    tal,
    enhet,
    huvud: `${tal} ${enhet}`,
    stod: `${minuterPerTimmeText(kvot)} skotning per timme skörd`,
  };
}
