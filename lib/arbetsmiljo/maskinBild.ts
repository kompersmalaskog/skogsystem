// Maskinbilden — föraren trycker PÅ maskinen där felet sitter i stället för att skriva var (Martin 2026-11-10:
// "bilder är alltid bättre än text", tecknad maskin, inte foto). EN källa för delarna, deras plats på teckningen och
// vad ett tryck betyder. Teckningen: components/arbetsmiljo/MaskinBild.tsx. Lagras på am_atgard (maskin_del, maskin_x,
// maskin_y; migration 20261110123344_am_atgard_maskin_plats.sql). Ren och testad: lib/arbetsmiljo/maskinBild.test.ts.
//
// Platsen sparas som 0..1 av teckningens bredd och höjd, så den ritas rätt i alla storlekar och om teckningen ritas om.

/** Teckningen är 400 × 240 (viewBox). Allt nedan är i de enheterna. */
export const BILD_B = 400;
export const BILD_H = 240;

/** `skordare` = fyrhjulig skördare (Rottne H8E), `skordare8` = åttahjulig med boggier (Ponsse Scorpion), `skotare` = skotare. */
export type BildTyp = 'skordare' | 'skordare8' | 'skotare';

/** Delarna i den ordning knapparna står. `annat` = ett tryck någon annanstans på maskinen. */
export const DEL_ORDNING = ['kran', 'hytt', 'stege', 'slackare', 'nodstopp', 'lackage', 'slang', 'band'] as const;
export type DelId = (typeof DEL_ORDNING)[number] | 'annat';

type DelDef = { namn: string; x: number; y: number };

/** Namnen är förarens ord. Skördarens kran har ett aggregat, skotarens en grip. */
const NAMN: Record<DelId, (t: BildTyp) => string> = {
  kran: t => (t === 'skotare' ? 'Kran och grip' : 'Kran och aggregat'),
  hytt: () => 'Lampa och ruta',
  stege: () => 'Stege och handtag',
  slackare: () => 'Släckare',
  nodstopp: () => 'Nödstopp och brytare',
  lackage: () => 'Läckage',
  slang: () => 'Slang och kabel',
  band: () => 'Band och kedjor',
  annat: () => 'Annat ställe',
};

/** Var varje del sitter på teckningen (stämmer med MaskinBild.tsx). */
const PLATS: Record<BildTyp, Record<(typeof DEL_ORDNING)[number], { x: number; y: number }>> = {
  skordare: {
    kran: { x: 104, y: 34 },
    hytt: { x: 161, y: 103 },
    stege: { x: 205, y: 168 },
    slackare: { x: 250, y: 166 },
    nodstopp: { x: 356, y: 124 },
    lackage: { x: 356, y: 176 },
    slang: { x: 106, y: 104 },
    band: { x: 112, y: 180 },
  },
  skordare8: {
    kran: { x: 100, y: 43 },
    hytt: { x: 163, y: 95 },
    stege: { x: 212, y: 160 },
    slackare: { x: 268, y: 156 },
    nodstopp: { x: 352, y: 118 },
    lackage: { x: 318, y: 174 },
    slang: { x: 196, y: 57 },
    band: { x: 139, y: 190 },
  },
  skotare: {
    kran: { x: 258, y: 30 },
    hytt: { x: 93, y: 94 },
    stege: { x: 134, y: 160 },
    slackare: { x: 202, y: 155 },
    nodstopp: { x: 34, y: 112 },
    lackage: { x: 56, y: 172 },
    slang: { x: 172, y: 64 },
    band: { x: 309, y: 190 },
  },
};

/** Ett tryck närmare än så här (i teckningens enheter) från en del väljer den delen. ~44 px på en telefon. */
export const TRAFF_RADIE = 26;

export type Val = { del: DelId; x: number; y: number };

/** Skördare med boggier fram och bak (åtta hjul). Allt annat ritas som fyrhjulig. */
const ATTA_HJUL = /\b8w\b|scorpion|bear|beaver|ergo/i;

/** Maskinens typ ur dim_maskin.maskin_typ (+ modell för skördarens hjul). Okänd typ (lastbil, saknas) = ingen teckning. */
export function bildTyp(maskinTyp: string | null | undefined, modell?: string | null): BildTyp | null {
  if (maskinTyp === 'Harvester') return modell && ATTA_HJUL.test(modell) ? 'skordare8' : 'skordare';
  if (maskinTyp === 'Forwarder') return 'skotare';
  return null;
}

export function delNamn(del: DelId, typ: BildTyp): string {
  return NAMN[del](typ);
}

/** Delarna med plats och namn, i knapparnas ordning. */
export function delar(typ: BildTyp): { id: (typeof DEL_ORDNING)[number]; namn: string; x: number; y: number }[] {
  return DEL_ORDNING.map(id => ({ id, namn: NAMN[id](typ), ...PLATS[typ][id] }));
}

function narmaste(typ: BildTyp, x: number, y: number): { def: ReturnType<typeof delar>[number]; d: number } {
  let bast = delar(typ)[0];
  let bastD = Infinity;
  for (const d of delar(typ)) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bastD) { bast = d; bastD = dist; }
  }
  return { def: bast, d: bastD };
}

/**
 * Ett tryck på teckningen (i teckningens enheter). Nära en del → den delen, med delens plats.
 * Annars → "Annat ställe" exakt där man tryckte. Utanför teckningen → null.
 */
export function tryck(typ: BildTyp, x: number, y: number): Val | null {
  if (!(x >= 0 && x <= BILD_B && y >= 0 && y <= BILD_H)) return null;
  const { def, d } = narmaste(typ, x, y);
  if (d <= TRAFF_RADIE) return { del: def.id, x: def.x, y: def.y };
  return { del: 'annat', x, y };
}

/** En knapp under teckningen valdes: delens plats. */
export function valjDel(typ: BildTyp, del: (typeof DEL_ORDNING)[number]): Val {
  const p = PLATS[typ][del];
  return { del, x: p.x, y: p.y };
}

/** Till databasen: 0..1, tre decimaler. */
export function tillLagring(v: Val): { maskin_del: DelId; maskin_x: number; maskin_y: number } {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { maskin_del: v.del, maskin_x: r(v.x / BILD_B), maskin_y: r(v.y / BILD_H) };
}

/** Från databasen. Något saknas eller är fel → null (då ritas ingen prick, aldrig en gissad). */
export function franLagring(del: unknown, x: unknown, y: unknown): Val | null {
  const giltig = (DEL_ORDNING as readonly string[]).includes(del as string) || del === 'annat';
  if (!giltig || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  return { del: del as DelId, x: x * BILD_B, y: y * BILD_H };
}
