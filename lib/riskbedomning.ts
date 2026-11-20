// RISKBEDÖMNING PER TRAKT — planeraren bedömer riskerna i "Klar med trakten?" innan maskinerna kommer, föraren läser och kvitterar.
//
// Tre delar, som Arbetsmiljöverket frågar efter (undersök · bedöm · åtgärda · dokumentera):
//   1. RISKERNA: appen föreslår det den redan vet (kraftledning ur Vidas underlag och kartan, brant, blött, markkabel, ej framkomligt,
//      motorsåg på trakten). Planeraren tar bort det som inte gäller och lägger till egna risker.
//   2. EN ÅTGÄRD PER RISK — en mening i vanliga ord ("Fäll aldrig mot ledningen …").
//   3. KVITTOT: planeraren trycker "Stämmer" (vem + när + fingeravtryck av listan); föraren trycker "Jag har läst" (tabellen trakt_risk_last, servertid).
//
// Ändras listan efter godkännandet (en ny ledning på kartan, en egen risk) gäller godkännandet inte längre och förarnas kvitton gäller inte heller —
// samma fingeravtrycksmönster som prognosen (lib/klarTrakt prognosUnderlag). Inget nollställs i databasen.
//
// ALLVARLIG ELLER MINDRE ALLVARLIG (2026-11-05, AFS 2023:1 11 §: av dokumentationen ska det framgå vilka riskerna är OCH om de är allvarliga).
// Varje risk är Allvarlig från början; planeraren ändrar med ett tryck (`mindre` = nycklarna som är mindre allvarliga). Bara de allvarliga visas
// i kortet i hytten; hela listan finns i ⓘ. En mindre allvarlig risk ändrar fingeravtrycket (`|mindre`) — en allvarlig gör det inte, så
// godkännanden och kvitton från före den här ändringen gäller som förut.
//
// Lagring: objekt.riskbedomning (jsonb) = { bort: string[], egna: [{ id, risk, atgard }], mindre?: string[], godkand: { av, at, underlag } | null }.
// Ren logik, ingen React, ingen databas.

export type RiskKalla = 'vida' | 'karta' | 'forutsattningar' | 'planerare';

export interface Risk {
  /** stabil nyckel: katalogens id för appens förslag, `egen:<id>` för planerarens egna */
  nyckel: string;
  risk: string;
  atgard: string;
  kalla: RiskKalla;
  /** AFS 2023:1 11 §: är risken allvarlig? Allvarlig från början; planeraren ändrar. */
  allvarlig: boolean;
}

export interface EgenRisk { id: string; risk: string; atgard: string }

export interface RiskGodkand { av: string | null; at: string; underlag: string }

export interface Riskbedomning {
  /** appens förslag (nycklar) som planeraren sagt "Gäller inte" om */
  bort: string[];
  egna: EgenRisk[];
  /** nycklar som planeraren sagt är MINDRE allvarliga (allt annat är allvarligt) */
  mindre: string[];
  godkand: RiskGodkand | null;
}

export const RISK_TOM: Riskbedomning = { bort: [], egna: [], mindre: [], godkand: null };

/** Katalogen: vad appen kan föreslå och vad man gör. Orden är vardagliga, en mening per åtgärd. Ändras HÄR. */
export const RISK_KATALOG = {
  kraftledning: { risk: 'Kraftledning', atgard: 'Fäll aldrig mot ledningen. Faller ett träd på den – gå inte fram, ring 112.' },
  markkabel: { risk: 'Markkabel', atgard: 'Kör bara över kabeln där det är märkt att man får.' },
  brant: { risk: 'Brant', atgard: 'Kör rakt upp och ner, aldrig snett. Stanna om det är halt.' },
  blott: { risk: 'Blött', atgard: 'Risa körvägen. Kör inte där maskinen sjunker.' },
  ej_framkomlig: { risk: 'Ej framkomligt', atgard: 'Kör inte in i ytan.' },
  jakttorn: { risk: 'Jakttorn', atgard: 'Fäll inte mot tornet. Titta att ingen sitter i det.' },
  motorsag: { risk: 'Motorsåg på trakten', atgard: 'Ingen motorsåg närmare maskinen än två trädlängder. Säg till när du börjar och slutar.' },
  varning: { risk: 'Varning på kartan', atgard: 'Läs texten vid varningen innan du kör dit.' },
} as const;

export type RiskNyckel = keyof typeof RISK_KATALOG;
const ORDNING: readonly RiskNyckel[] = ['kraftledning', 'markkabel', 'brant', 'blott', 'ej_framkomlig', 'jakttorn', 'motorsag', 'varning'];

export interface RiskForslagIndata {
  /** kartans markeringar: slag 'symbol' (typ = symbolens id), 'linje' (lineType), 'zon' (zoneType) */
  markeringar: ReadonlyArray<{ slag: string; typ: string }>;
  /** Vidas underlag har en kraftledning (lib/fokusTrakt arFara på traktgeometrin) */
  vidaKraftledning: boolean;
  /** Förutsättningar i Klar med trakten */
  terrang: string | null;
  barighet: string | null;
  /** manuell fällning planerad (objektets fält) */
  manuellFallning: boolean;
}

/** Appens förslag, i katalogens ordning, med källan. Varje nyckel högst en gång. */
export function foreslaRisker(i: RiskForslagIndata): Risk[] {
  const har = (slag: string, ...typer: string[]) => i.markeringar.some((m) => m.slag === slag && typer.includes(m.typ));
  const kallor = new Map<RiskNyckel, RiskKalla>();
  const satt = (n: RiskNyckel, k: RiskKalla) => { if (!kallor.has(n)) kallor.set(n, k); };

  if (i.vidaKraftledning) satt('kraftledning', 'vida');
  if (har('symbol', 'powerline') || har('linje', 'powerline')) satt('kraftledning', 'karta');
  if (har('symbol', 'groundcable')) satt('markkabel', 'karta');
  if (har('symbol', 'steep') || har('zon', 'steep')) satt('brant', 'karta');
  if (i.terrang === 'brant') satt('brant', 'forutsattningar');
  if (har('symbol', 'wet') || har('zon', 'wet')) satt('blott', 'karta');
  if (i.barighet === 'dalig') satt('blott', 'forutsattningar');
  if (har('zon', 'noentry')) satt('ej_framkomlig', 'karta');
  // Jakttorn föreslås inte (Martin 2026-11-12: det sitter aldrig någon i dem när vi kör; tornet är Info, inte fara).
  // Nyckeln finns kvar i katalogen så att en sparad bedömning med jakttorn fortfarande går att läsa.
  if (i.manuellFallning) satt('motorsag', 'forutsattningar');
  if (har('symbol', 'manualfelling')) satt('motorsag', 'karta');
  if (har('symbol', 'warning')) satt('varning', 'karta');

  return ORDNING.filter((n) => kallor.has(n)).map((n) => ({ nyckel: n, risk: RISK_KATALOG[n].risk, atgard: RISK_KATALOG[n].atgard, kalla: kallor.get(n)!, allvarlig: true }));
}

/** Listan som gäller: förslagen utom de som "gäller inte", sedan planerarens egna (i den ordning de lades till). */
export function aktuellaRisker(forslag: readonly Risk[], rb: Riskbedomning): Risk[] {
  const bort = new Set(rb.bort);
  const mindre = new Set(rb.mindre ?? []);
  return [
    ...forslag.filter((r) => !bort.has(r.nyckel)).map((r) => ({ ...r, allvarlig: !mindre.has(r.nyckel) })),
    ...rb.egna.map((e) => ({ nyckel: `egen:${e.id}`, risk: e.risk, atgard: e.atgard, kalla: 'planerare' as const, allvarlig: !mindre.has(`egen:${e.id}`) })),
  ];
}

/** Förslag som planeraren tagit bort (visas som "Gäller inte" med Ta tillbaka). */
export function borttagnaForslag(forslag: readonly Risk[], rb: Riskbedomning): Risk[] {
  const bort = new Set(rb.bort);
  return forslag.filter((r) => bort.has(r.nyckel));
}

/** Fingeravtryck av listan. Ordningen spelar ingen roll; texten gör det (en ändrad åtgärd är en ny bedömning). */
export function riskUnderlag(risker: readonly Risk[]): string {
  return risker.map((r) => `${r.nyckel}=${r.risk.trim()}|${r.atgard.trim()}${r.allvarlig === false ? '|mindre' : ''}`).sort().join('§') || 'inga';
}

export type RiskLage = 'godkand' | 'kvar';

/** Godkänd = planeraren tryckt Stämmer på exakt den här listan. En tom lista går också att godkänna ("Inga särskilda risker"). */
export function riskLage(risker: readonly Risk[], rb: Riskbedomning): RiskLage {
  return rb.godkand && rb.godkand.underlag === riskUnderlag(risker) ? 'godkand' : 'kvar';
}

// ── Ändringar (rena; sidan sparar resultatet) ────────────────────────────────────────────────────────────────────────

/** "Gäller inte" på ett av appens förslag. */
export function taBortForslag(rb: Riskbedomning, nyckel: string): Riskbedomning {
  return rb.bort.includes(nyckel) ? rb : { ...rb, bort: [...rb.bort, nyckel] };
}

/** Ta tillbaka ett borttaget förslag. */
export function aterstallForslag(rb: Riskbedomning, nyckel: string): Riskbedomning {
  return { ...rb, bort: rb.bort.filter((n) => n !== nyckel) };
}

/** Lägg till en egen risk. Tom risk eller tom åtgärd läggs inte till (null). */
export function laggTillEgen(rb: Riskbedomning, id: string, risk: string, atgard: string): Riskbedomning | null {
  const r = risk.trim(); const a = atgard.trim();
  if (!r || !a) return null;
  return { ...rb, egna: [...rb.egna, { id, risk: r.slice(0, 120), atgard: a.slice(0, 280) }] };
}

export function taBortEgen(rb: Riskbedomning, id: string): Riskbedomning {
  return { ...rb, egna: rb.egna.filter((e) => e.id !== id), mindre: (rb.mindre ?? []).filter((n) => n !== `egen:${id}`) };
}

/** Allvarlig eller mindre allvarlig, ett tryck. */
export function sattAllvarlig(rb: Riskbedomning, nyckel: string, allvarlig: boolean): Riskbedomning {
  const utan = (rb.mindre ?? []).filter((n) => n !== nyckel);
  return { ...rb, mindre: allvarlig ? utan : [...utan, nyckel] };
}

/** Bara de allvarliga (kortet i hytten). */
export function allvarliga<T extends { allvarlig: boolean }>(risker: readonly T[]): T[] {
  return risker.filter((r) => r.allvarlig);
}

/** Allvarliga först, sedan de mindre allvarliga — ordningen inom varje grupp står kvar. */
export function allvarligaForst<T extends { allvarlig: boolean }>(risker: readonly T[]): T[] {
  return [...risker.filter((r) => r.allvarlig), ...risker.filter((r) => !r.allvarlig)];
}

export function godkann(rb: Riskbedomning, risker: readonly Risk[], av: string | null, nu: string): Riskbedomning {
  return { ...rb, godkand: { av, at: nu, underlag: riskUnderlag(risker) } };
}

// ── Lagring ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** objekt.riskbedomning → bedömning. Tolerant: allt okänt ignoreras, aldrig ett kast. */
export function lasRiskbedomning(raw: unknown): Riskbedomning {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...RISK_TOM, bort: [], egna: [], mindre: [] };
  const o = raw as Record<string, unknown>;
  const bort = Array.isArray(o.bort) ? o.bort.filter((x): x is string => typeof x === 'string') : [];
  const egna = Array.isArray(o.egna)
    ? o.egna.flatMap((e) => {
      const x = e as Record<string, unknown> | null;
      return x && typeof x.id === 'string' && typeof x.risk === 'string' && typeof x.atgard === 'string' ? [{ id: x.id, risk: x.risk, atgard: x.atgard }] : [];
    })
    : [];
  const mindre = Array.isArray(o.mindre) ? o.mindre.filter((x): x is string => typeof x === 'string') : [];
  const g = o.godkand as Record<string, unknown> | null | undefined;
  const godkand = g && typeof g === 'object' && typeof g.at === 'string' && typeof g.underlag === 'string'
    ? { av: typeof g.av === 'string' ? g.av : null, at: g.at, underlag: g.underlag }
    : null;
  return { bort, egna, mindre, godkand };
}

/** Kolumnformen. En helt tom bedömning sparas som null (aldrig {}). */
export function riskbedomningTillKolumn(rb: Riskbedomning): Record<string, unknown> | null {
  const mindre = rb.mindre ?? [];
  if (rb.bort.length === 0 && rb.egna.length === 0 && mindre.length === 0 && !rb.godkand) return null;
  // `mindre` skrivs bara när den har något — en bedömning utan den ser ut exakt som förut.
  return mindre.length > 0 ? { bort: rb.bort, egna: rb.egna, mindre, godkand: rb.godkand } : { bort: rb.bort, egna: rb.egna, godkand: rb.godkand };
}

// ── Föraren ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ForarRisk {
  /** null = planeraren har inte gjort bedömningen än (föraren ser bara en dämpad rad) */
  risker: Risk[] | null;
  /** fingeravtrycket föraren kvitterar */
  underlag: string | null;
  /** föraren har läst exakt den här listan */
  last: boolean;
}

/**
 * Vad föraren ser. Bara en GJORD bedömning visas (planeraren har tryckt Stämmer någon gång). Har listan ändrats sedan dess visas den nya listan —
 * förslag ur kartan är fakta — och kvittot gäller den nya (ett gammalt "Jag har läst" gäller inte en ny ledning).
 */
export function forarRisk(risker: readonly Risk[], rb: Riskbedomning, lastaUnderlag: readonly string[]): ForarRisk {
  if (!rb.godkand) return { risker: null, underlag: null, last: false };
  const underlag = riskUnderlag(risker);
  return { risker: [...risker], underlag, last: lastaUnderlag.includes(underlag) };
}

/** "3 risker", "1 risk", "Inga särskilda risker" */
export function riskAntalText(n: number): string {
  return n === 0 ? 'Inga särskilda risker' : n === 1 ? '1 risk' : `${n} risker`;
}

export const KALLA_TEXT: Record<RiskKalla, string> = {
  vida: 'Från Vidas underlag', karta: 'Från kartan', forutsattningar: 'Från förutsättningarna', planerare: 'Tillagd av planeraren',
};
