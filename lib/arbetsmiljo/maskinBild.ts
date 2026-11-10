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
    kran: { x: 104, y: 30 },
    hytt: { x: 161, y: 100 },
    stege: { x: 212, y: 172 },
    slackare: { x: 268, y: 122 },
    nodstopp: { x: 360, y: 130 },
    lackage: { x: 356, y: 180 },
    slang: { x: 106, y: 80 },
    band: { x: 118, y: 176 },
  },
  skordare8: {
    kran: { x: 110, y: 24 },
    hytt: { x: 120, y: 100 },
    stege: { x: 207, y: 176 },
    slackare: { x: 250, y: 166 },
    nodstopp: { x: 358, y: 124 },
    lackage: { x: 376, y: 176 },
    slang: { x: 182, y: 72 },
    band: { x: 123, y: 188 },
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

/** Vilken sida av maskinen teckningen visar (Martin 2026-11-10: höger och vänster, aldrig fram eller bak).
 * Vänster = teckningen som den är ritad (fronten åt vänster). Höger = samma teckning spegelvänd. */
export type Sida = 'vanster' | 'hoger';
export const SIDOR = ['vanster', 'hoger'] as const;
export const SIDA_NAMN: Record<Sida, string> = { vanster: 'Vänster sida', hoger: 'Höger sida' };

/** x,y är i teckningens enheter SÅ SOM DEN VISAS (spegelvänd på höger sida). `sida` saknas = okänd (rader från
 * före sidorna) — ritas som vänster sida men sägs aldrig i text. */
export type Val = { del: DelId; x: number; y: number; sida?: Sida };

/** En plats på vänster sidas teckning, på den sida som visas. */
const pa = (sida: Sida | undefined, x: number) => (sida === 'hoger' ? BILD_B - x : x);

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
export function delar(typ: BildTyp, sida: Sida = 'vanster'): { id: (typeof DEL_ORDNING)[number]; namn: string; x: number; y: number }[] {
  return DEL_ORDNING.map(id => ({ id, namn: NAMN[id](typ), x: pa(sida, PLATS[typ][id].x), y: PLATS[typ][id].y }));
}

function narmaste(typ: BildTyp, sida: Sida, x: number, y: number): { def: ReturnType<typeof delar>[number]; d: number } {
  const lista = delar(typ, sida);
  let bast = lista[0];
  let bastD = Infinity;
  for (const d of lista) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bastD) { bast = d; bastD = dist; }
  }
  return { def: bast, d: bastD };
}

/**
 * Ett tryck på teckningen (i teckningens enheter). Nära en del → den delen, med delens plats.
 * Annars → "Annat ställe" exakt där man tryckte. Utanför teckningen → null.
 */
export function tryck(typ: BildTyp, x: number, y: number, sida?: Sida): Val | null {
  if (!(x >= 0 && x <= BILD_B && y >= 0 && y <= BILD_H)) return null;
  const { def, d } = narmaste(typ, sida ?? 'vanster', x, y);
  const v: Val = d <= TRAFF_RADIE ? { del: def.id, x: def.x, y: def.y } : { del: 'annat', x, y };
  if (sida) v.sida = sida;
  return v;
}

/** En knapp under teckningen valdes: delens plats. */
export function valjDel(typ: BildTyp, del: (typeof DEL_ORDNING)[number], sida?: Sida): Val {
  const p = PLATS[typ][del];
  const v: Val = { del, x: pa(sida, p.x), y: p.y };
  if (sida) v.sida = sida;
  return v;
}

/** Föraren byter sida: en namngiven del följer med till samma del på andra sidan. "Annat ställe" går inte att flytta
 * (en plats på vänster sida är ingen plats på höger) — då är inget valt. */
export function bytSida(typ: BildTyp, v: Val | null, sida: Sida): Val | null {
  if (!v || v.del === 'annat') return null;
  return valjDel(typ, v.del, sida);
}

/** "höger sida" / "vänster sida" när sidan är känd, annars inget. */
export function sidaText(v: Pick<Val, 'sida'>): string | null {
  return v.sida ? SIDA_NAMN[v.sida].toLowerCase() : null;
}

/** Till databasen: 0..1, tre decimaler. */
export function tillLagring(v: Val): { maskin_del: DelId; maskin_x: number; maskin_y: number; maskin_sida?: Sida } {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { maskin_del: v.del, maskin_x: r(v.x / BILD_B), maskin_y: r(v.y / BILD_H), ...(v.sida ? { maskin_sida: v.sida } : {}) };
}

/** Från databasen. Något saknas eller är fel → null (då ritas ingen prick, aldrig en gissad). */
export function franLagring(del: unknown, x: unknown, y: unknown, sida?: unknown): Val | null {
  const giltig = (DEL_ORDNING as readonly string[]).includes(del as string) || del === 'annat';
  if (!giltig || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  const v: Val = { del: del as DelId, x: x * BILD_B, y: y * BILD_H };
  if (sida === 'vanster' || sida === 'hoger') v.sida = sida;
  return v;
}
