// "Dina genvägar" i körvyns snabbark (plus-knappen): max 4, sparas per maskin, standard Högstubbe + Evighetsträd + Mät sträcka +
// Mät yta. Dessutom "senast använda symboler" (ordning i symbolrutnätet), också per maskin.
//
// Per maskin = localStorage-nyckel med maskinens id. En maskindator = en maskin, så valet följer maskinen, inte inloggningen.
// Saknas maskin (admin som provar körvyn, testläge) delar de nyckeln 'ingen'.
//
// En genväg är en liten beskrivning (typ + id), aldrig en funktion — själva handlingen (sätt symbol, starta mätning, växla
// lager) bestäms av körvyn när genvägen trycks. Okända/trasiga poster i lagringen kastas tyst bort.

export const MAX_GENVAGAR = 4;

export type MatningId = 'strackan' | 'yta' | 'kor';
export type InstallningId = 'kompass' | 'rotera';   // kompass = körvyns enhetskompass (Lager), rotera = "Rotera kartan" efter färdriktning (Inställningar)

export type Genvag =
  | { typ: 'symbol'; id: string }          // sätt symbolen på maskinens position
  | { typ: 'matning'; id: MatningId }      // starta ett mätläge
  | { typ: 'lager'; id: string }           // växla ett kartlager på/av (overlays[id])
  | { typ: 'installning'; id: InstallningId }; // växla en inställning på/av

export const MATNING_IDS: readonly MatningId[] = ['strackan', 'yta', 'kor'];
export const INSTALLNING_IDS: readonly InstallningId[] = ['kompass', 'rotera'];

export const STANDARD_GENVAGAR: readonly Genvag[] = [
  { typ: 'symbol', id: 'highstump' },
  { typ: 'symbol', id: 'eternitytree' },
  { typ: 'matning', id: 'strackan' },
  { typ: 'matning', id: 'yta' },
];

export interface Lagring { getItem(k: string): string | null; setItem(k: string, v: string): void }

function lagringNu(): Lagring | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Namn på de fasta lagren i Lager-menyn (WMS-lagrens namn hämtas ur lib/mapLayers). Okänt id → id visas (aldrig tomt). */
export const FASTA_LAGERNAMN: Readonly<Record<string, string>> = {
  vidaKartbild: 'VIDA-kartbild',
  hansyn: 'Hänsyn',
  traktNyckelbiotop: 'Nyckelbiotoper',
  traktLamning: 'Fornlämningar',
  korFara: 'Kör & fara',
  wetlands: 'Sumpskog',
  sks_markfuktighet: 'Markfuktighet',
  fastighetsgranser: 'Fastighetsgränser',
  hydrografi: 'Diken & vattendrag',
  brandrisk: 'Brandrisk',
};
export const MATNING_NAMN: Readonly<Record<MatningId, string>> = { strackan: 'Mät sträcka', yta: 'Mät yta', kor: 'Mät genom att köra' };
export const INSTALLNING_NAMN: Readonly<Record<InstallningId, string>> = { kompass: 'Kompass', rotera: 'Rotera kartan' };

/** Stabil nyckel för en genväg (React-key, dubblettkoll). */
export const genvagNyckel = (g: Genvag): string => `${g.typ}:${g.id}`;
export const arSammaGenvag = (a: Genvag, b: Genvag): boolean => genvagNyckel(a) === genvagNyckel(b);

const maskinDel = (maskinId: string | null | undefined): string => (maskinId && maskinId.trim()) || 'ingen';
export const genvagarLagringsnyckel = (maskinId: string | null | undefined): string => `korvy_genvagar_v1:${maskinDel(maskinId)}`;
export const senastLagringsnyckel = (maskinId: string | null | undefined): string => `korvy_senast_v1:${maskinDel(maskinId)}`;

function giltigGenvag(x: any): x is Genvag {
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id || x.id.length > 60) return false;
  if (x.typ === 'symbol' || x.typ === 'lager') return true;
  if (x.typ === 'matning') return (MATNING_IDS as readonly string[]).includes(x.id);
  if (x.typ === 'installning') return (INSTALLNING_IDS as readonly string[]).includes(x.id);
  return false;
}

/** Tolka sparad JSON. null = inget sparat eller trasigt → anroparen använder standard. [] är giltigt (föraren tog bort allt). */
export function tolkaGenvagar(raw: string | null | undefined): Genvag[] | null {
  if (raw == null || raw === '') return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(parsed)) return null;
  const ut: Genvag[] = [];
  for (const x of parsed) {
    if (!giltigGenvag(x)) continue;
    const g: Genvag = { typ: x.typ, id: x.id } as Genvag;
    if (ut.some((y) => arSammaGenvag(y, g))) continue;
    ut.push(g);
    if (ut.length >= MAX_GENVAGAR) break;
  }
  return ut;
}

/** Maskinens genvägar, eller standard om inget sparats. Tål blockerad localStorage. */
export function hamtaGenvagar(maskinId: string | null | undefined, lagring: Lagring | null = lagringNu()): Genvag[] {
  try {
    const sparat = tolkaGenvagar(lagring?.getItem(genvagarLagringsnyckel(maskinId)));
    return sparat ?? STANDARD_GENVAGAR.map((g) => ({ ...g }));
  } catch {
    return STANDARD_GENVAGAR.map((g) => ({ ...g }));
  }
}

/** Spara maskinens genvägar. Returnerar false om lagringen inte gick att skriva (visas aldrig som ett lyckat spar). */
export function sparaGenvagar(maskinId: string | null | undefined, lista: readonly Genvag[], lagring: Lagring | null = lagringNu()): boolean {
  try {
    if (!lagring) return false;
    lagring.setItem(genvagarLagringsnyckel(maskinId), JSON.stringify(lista.slice(0, MAX_GENVAGAR)));
    return true;
  } catch {
    return false;
  }
}

export type LaggTillResultat =
  | { ok: true; lista: Genvag[] }
  | { ok: false; skal: 'full' | 'finns' };

/** Lägg i plus. Max 4 — är det fullt får föraren ta bort en först (inget byts ut i smyg). Redan där → 'finns'. */
export function laggTillGenvag(lista: readonly Genvag[], g: Genvag): LaggTillResultat {
  if (lista.some((x) => arSammaGenvag(x, g))) return { ok: false, skal: 'finns' };
  if (lista.length >= MAX_GENVAGAR) return { ok: false, skal: 'full' };
  return { ok: true, lista: [...lista, g] };
}

export function taBortGenvag(lista: readonly Genvag[], g: Genvag): Genvag[] {
  return lista.filter((x) => !arSammaGenvag(x, g));
}

// ── Senast använda symboler (ordning i symbolrutnätet) ──────────────────────────────────────────────────────────────────

const MAX_SENAST = 12;

export function hamtaSenast(maskinId: string | null | undefined, lagring: Lagring | null = lagringNu()): string[] {
  try {
    const raw = lagring?.getItem(senastLagringsnyckel(maskinId));
    const p = raw ? JSON.parse(raw) : null;
    return Array.isArray(p) ? p.filter((x) => typeof x === 'string' && x).slice(0, MAX_SENAST) : [];
  } catch {
    return [];
  }
}

/** Lägg symbolen först i "senast använda" (utan dubbletter, max 12). Returnerar den nya listan. */
export function noteraSenast(maskinId: string | null | undefined, symbolId: string, lagring: Lagring | null = lagringNu()): string[] {
  const ny = [symbolId, ...hamtaSenast(maskinId, lagring).filter((x) => x !== symbolId)].slice(0, MAX_SENAST);
  try { lagring?.setItem(senastLagringsnyckel(maskinId), JSON.stringify(ny)); } catch { /* ordningen är en bekvämlighet, aldrig ett fel */ }
  return ny;
}

/** Senast använda först, resten i ursprunglig ordning. Okända id:n i `senast` ignoreras. */
export function ordnaSenastForst<T extends { id: string }>(alla: readonly T[], senast: readonly string[]): T[] {
  const forst: T[] = [];
  for (const id of senast) {
    const s = alla.find((a) => a.id === id);
    if (s && !forst.includes(s)) forst.push(s);
  }
  return [...forst, ...alla.filter((a) => !forst.includes(a))];
}
