// Objektinfon (ⓘ i /planering) som ett kort: allt som kortet, "Om trakten" och "Mer" behöver veta, som rena funktioner utan React och utan
// kartan. Sidan (app/planering/page.tsx) matar in data och callbacks; komponenterna (components/planering/{ObjektKort,OmTrakten,MerMeny}.tsx)
// ritar. Det som avgörs här är det som går att ha fel om: vilka knappar en roll får, vad som visas och vad som döljs, och vilka val "Mer" har.

// ── Kortets rad under namnet: "typ · avtalsform · cert" ──────────────────────────────────────────────────────────────

/** "Slutavverkning · Rp · FSC PEFC". Tomma delar utelämnas — aldrig ett tomt streck. Avtalsform finns bara på slutavverkning. */
export function objektRad(o: { typ?: string | null; avtalsform?: string | null; cert?: string | null; arSlutavverkning?: boolean }): string {
  const cert = String(o.cert ?? '').trim();
  const delar = [
    String(o.typ ?? '').trim(),
    o.arSlutavverkning === false ? '' : String(o.avtalsform ?? '').trim(),
    // "None" / "Not known" är databasens sätt att säga "vet ej" — det är inget certifikat.
    cert && !/^(none|not known)$/i.test(cert) ? cert : '',
  ];
  return delar.filter(Boolean).join(' · ');
}

// ── Knapprad efter roll ──────────────────────────────────────────────────────────────────────────────────────────────

export type KortKnappId = 'kor-hit' | 'korvy' | 'skotning' | 'utkort' | 'mer';
export interface KortKnapp { id: KortKnappId; etikett: string }
export type KortRoll = 'planerare' | 'forare';

/**
 * Planerare: Kör hit · Mer. ("Inför maskin" kommer i en egen PR och visas först då — en knapp som inte finns får inte ligga där.)
 * Förare: Körvy · Skotning · Utkört · Mer. Körvy-knappen försvinner medan körvyn redan är igång (Avsluta körvy ligger i Mer). En skördarförare har
 * ingen skotning att öppna eller markera utkört: Skotning och Utkört visas för skotare och när maskinen inte är känd.
 */
export function kortKnappar(o: { roll: KortRoll; harKoordinat: boolean; korvyAktiv: boolean; maskinSlag: 'skordare' | 'skotare' | null }): KortKnapp[] {
  if (o.roll === 'planerare') {
    return [
      ...(o.harKoordinat ? [{ id: 'kor-hit' as const, etikett: 'Kör hit' }] : []),
      { id: 'mer', etikett: 'Mer' },
    ];
  }
  return [
    ...(o.korvyAktiv ? [] : [{ id: 'korvy' as const, etikett: 'Körvy' }]),
    ...(o.maskinSlag === 'skordare' ? [] : [{ id: 'skotning' as const, etikett: 'Skotning' }, { id: 'utkort' as const, etikett: 'Utkört' }]),
    { id: 'mer', etikett: 'Mer' },
  ];
}

// ── Faktabrickor ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Bricka { id: string; varde: string; etikett?: string }

const sv = (n: number, dec: number) => n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: dec });
const tal = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** ha, m³, medelstam (om den finns), GROT ja/nej. Bara det som har värde: 0, tomt och null ger ingen bricka. */
export function faktaBrickor(o: { areal?: unknown; volym?: unknown; medelstam?: unknown; grot?: boolean | null }): Bricka[] {
  const ut: Bricka[] = [];
  const ha = tal(o.areal); if (ha != null) ut.push({ id: 'areal', varde: `${sv(ha, 2)} ha` });
  const m3 = tal(o.volym); if (m3 != null) ut.push({ id: 'volym', varde: `${sv(m3, 0)} m³` });
  const ms = tal(o.medelstam); if (ms != null) ut.push({ id: 'medelstam', varde: `${sv(ms, 2)} m³`, etikett: 'medelstam' });
  if (o.grot === true) ut.push({ id: 'grot', varde: 'GROT ja' });
  else if (o.grot === false) ut.push({ id: 'grot', varde: 'GROT nej' });
  return ut;
}

/** Det som låg under "Fakta" förut (bärighet, terräng, basväg) — visas i kortets uppdragna läge så inget försvinner. */
export function extraBrickor(o: { barighet?: string | null; terrang?: string | null; basvag?: string | null; avverkat?: string | null }): Bricka[] {
  const ut: Bricka[] = [];
  const t = (v: string | null | undefined) => String(v ?? '').trim();
  if (t(o.avverkat)) ut.push({ id: 'avverkat', varde: t(o.avverkat), etikett: 'avverkat' });
  if (t(o.barighet)) ut.push({ id: 'barighet', varde: t(o.barighet), etikett: 'bärighet' });
  if (t(o.terrang)) ut.push({ id: 'terrang', varde: t(o.terrang), etikett: 'terräng' });
  if (t(o.basvag)) ut.push({ id: 'basvag', varde: t(o.basvag), etikett: 'basväg' });
  return ut;
}

// ── Till föraren ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TillForarenPost { id: string; avsandare: string; text: string }

export const AVSANDARE_VIDA = 'Vida';
export const AVSANDARE_PLANERARE = 'Planerare';

/**
 * Vidas direktiv och planerarens egen text, var och en med vem som skrivit. Förardirektivet (planerarens korta körinstruktion) först, sedan Vida,
 * sedan planerarens "Att tänka på". Tomma texter utelämnas. Ingen författare lagras per text i databasen — planerarens text signeras med rollen.
 */
export function tillForaren(o: { forardirektiv?: string | null; vida?: string | null; anteckningar?: string | null }): TillForarenPost[] {
  const rensa = (s: string | null | undefined) => String(s ?? '').trim();
  const ut: TillForarenPost[] = [];
  if (rensa(o.forardirektiv)) ut.push({ id: 'forardirektiv', avsandare: AVSANDARE_PLANERARE, text: rensa(o.forardirektiv) });
  if (rensa(o.vida)) ut.push({ id: 'vida', avsandare: AVSANDARE_VIDA, text: rensa(o.vida) });
  if (rensa(o.anteckningar)) ut.push({ id: 'anteckningar', avsandare: AVSANDARE_PLANERARE, text: rensa(o.anteckningar) });
  return ut;
}

/** Kortet visar högst tre rader per text. Texten behöver "Läs allt ›" när den inte ryms: för lång, eller fler än tre rader. */
export const KORT_RADER = 3;
const TECKEN_PER_RAD = 38;
export function behoverLasAllt(text: string): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const rader = t.split(/\r?\n/).reduce((s, r) => s + Math.max(1, Math.ceil(r.length / TECKEN_PER_RAD)), 0);
  return rader > KORT_RADER;
}

// ── Markeringar: "På trakten" och "Om trakten" ──────────────────────────────────────────────────────────────────────

export type MarkeringsSlag = 'symbol' | 'linje' | 'zon';
export interface KartMarkering {
  id: string;
  slag: MarkeringsSlag;
  typ: string;
  /** visningsnamn i singular ("Högstubbe") */
  namn: string;
  comment: string;
  photoPath?: string | null;
  photoData?: string | null;
  photoTs?: number | null;
  lat: number | null;
  lng: number | null;
  /** när den skapades (ms) om det går att läsa ur id:t, annars null */
  skapad: number | null;
  /** plats i markeringslistan = ordningen de lästes in (reserv när tidsstämpel saknas) */
  ordning: number;
}

export const harText = (m: Pick<KartMarkering, 'comment'>): boolean => !!m.comment.trim();
export const harFoto = (m: Pick<KartMarkering, 'photoPath' | 'photoData'>): boolean => !!(m.photoPath || m.photoData);
/** Med kommentar eller foto — de som får en rad i "På kartan". */
export const harInnehall = (m: KartMarkering): boolean => harText(m) || harFoto(m);

export interface MarkeringsSammanfattning { antal: number; medText: number }
/** Raden i kortet: "N markeringar · M med text". "Med text" = med kommentar eller foto (det Om trakten listar). */
export function sammanfattaMarkeringar(ms: readonly KartMarkering[]): MarkeringsSammanfattning {
  return { antal: ms.length, medText: ms.filter(harInnehall).length };
}
export function markeringsRad(s: MarkeringsSammanfattning): string {
  const ord = s.antal === 1 ? 'markering' : 'markeringar';
  return s.medText > 0 ? `${s.antal} ${ord} · ${s.medText} med text` : `${s.antal} ${ord}`;
}

const PLURAL: Record<string, [string, string]> = {
  eternitytree: ['evighetsträd', 'evighetsträd'], naturecorner: ['naturhörna', 'naturhörnor'],
  culturemonument: ['kulturminne', 'kulturminnen'], culturestump: ['kulturstubbe', 'kulturstubbar'],
  highstump: ['högstubbe', 'högstubbar'], landing: ['avlägg', 'avlägg'], brashpile: ['rishög', 'rishögar'],
  windfall: ['vindfälle', 'vindfällen'], manualfelling: ['manuell fällning', 'manuella fällningar'],
  powerline: ['kraftledning', 'kraftledningar'], road: ['väg', 'vägar'], turningpoint: ['vändplats', 'vändplatser'],
  ditch: ['dike', 'diken'], bridge: ['bro', 'broar'], corduroy: ['kavling', 'kavlingar'],
  wet: ['fuktig mark', 'fuktiga partier'], steep: ['brant', 'branter'], trail: ['stig', 'stigar'], warning: ['varning', 'varningar'],
};
const LINJE_PLURAL: Record<string, [string, string]> = {
  mainRoad: ['basväg', 'basvägar'], ditch: ['dike', 'diken'], trail: ['stig', 'stigar'], nature: ['naturvårdslinje', 'naturvårdslinjer'],
  sideRoadRed: ['röd stickväg', 'röda stickvägar'], sideRoadYellow: ['gul stickväg', 'gula stickvägar'], sideRoadBlue: ['blå stickväg', 'blå stickvägar'],
  backRoadRed: ['röd backväg', 'röda backvägar'], backRoadYellow: ['gul backväg', 'gula backvägar'], backRoadBlue: ['blå backväg', 'blå backvägar'],
};

/** Namn med räkneord i rätt form ("1 högstubbe", "5 högstubbar"). Okänd typ: visningsnamnet i gemener. */
export function namnMedAntal(slag: MarkeringsSlag, typ: string, fallbackNamn: string, n: number): string {
  const tabell = slag === 'linje' ? LINJE_PLURAL : slag === 'symbol' ? PLURAL : {};
  const par = (tabell as Record<string, [string, string]>)[typ];
  const ord = par ? par[n === 1 ? 0 : 1] : String(fallbackNamn || typ).toLowerCase();
  return `${n} ${ord}`;
}

/** Markeringarna UTAN kommentar eller foto som antal per typ: "5 högstubbar · 2 avlägg". Flest först. Tom lista → tom sträng. */
export function antalPerTyp(ms: readonly KartMarkering[]): string {
  const grupper = new Map<string, { slag: MarkeringsSlag; typ: string; namn: string; n: number }>();
  for (const m of ms) {
    if (harInnehall(m)) continue;
    const k = `${m.slag}:${m.typ}`;
    const g = grupper.get(k);
    if (g) g.n += 1; else grupper.set(k, { slag: m.slag, typ: m.typ, namn: m.namn, n: 1 });
  }
  return Array.from(grupper.values())
    .sort((a, b) => b.n - a.n)
    .map((g) => namnMedAntal(g.slag, g.typ, g.namn, g.n))
    .join(' · ');
}

// Avstånd i luftlinje (m) mellan två punkter.
export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Positionen kortet och Om trakten räknar avstånd från. Sidans `currentPosition` är `{ lat, lon }` (INTE en GeolocationPosition — ingen `.coords`);
 * körvyns effektiva position har samma form och går först. Ren funktion så att just den här omvandlingen går att testa: sidan går inte att montera
 * i test, och en läsning av `.coords` kraschade ⓘ (PR 766) trots gröna komponenttester som matade in `{ lat, lng }` direkt.
 */
export function gpsNu(o: { korvyAktiv: boolean; korvyPos: { lat: number; lon: number } | null; position: { lat: number; lon: number } | null }): { lat: number; lng: number } | null {
  const k = o.korvyAktiv ? o.korvyPos : null;
  const p = k ?? o.position;
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lng: p.lon } : null;
}

/** "85 m" under 1 km, "1,3 km" över. */
export function avstandText(m: number): string {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.max(5, Math.round(m / 5) * 5)} m` : `${(Math.round(m / 100) / 10).toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export interface MarkeringMedAvstand extends KartMarkering { avstandM: number | null }

/** Närmast först när GPS finns; annars i den ordning de skapades. Markeringar utan position hamnar sist. */
export function sorteraMarkeringar(ms: readonly KartMarkering[], pos: { lat: number; lng: number } | null): MarkeringMedAvstand[] {
  const med: MarkeringMedAvstand[] = ms.map((m) => ({ ...m, avstandM: pos && m.lat != null && m.lng != null ? distM(pos, { lat: m.lat, lng: m.lng }) : null }));
  const iSkapadOrdning = (a: MarkeringMedAvstand, b: MarkeringMedAvstand) =>
    (a.skapad ?? Number.POSITIVE_INFINITY) - (b.skapad ?? Number.POSITIVE_INFINITY) || a.ordning - b.ordning;
  if (!pos) return med.sort(iSkapadOrdning);
  return med.sort((a, b) => {
    if (a.avstandM == null && b.avstandM == null) return iSkapadOrdning(a, b);
    if (a.avstandM == null) return 1;
    if (b.avstandM == null) return -1;
    return a.avstandM - b.avstandM || iSkapadOrdning(a, b);
  });
}

/** Sökfältet i Om trakten: träffar text i kommentaren och symbolens namn (ingen skillnad på versaler). Tom sökning släpper igenom allt. */
export function matcharSok(text: string, q: string): boolean {
  const s = q.trim().toLowerCase();
  return !s || String(text ?? '').toLowerCase().includes(s);
}
export function filtreraMarkeringar<T extends KartMarkering>(ms: readonly T[], q: string): T[] {
  return ms.filter((m) => matcharSok(m.comment, q) || matcharSok(m.namn, q));
}

// ── Mer ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MerRad { id: string; etikett: string; under?: string; ikon: string; onTryck: () => void; farlig?: boolean }
export type MerGruppId = 'korvy' | 'foraren' | 'planeraren' | 'ovrigt';
export interface MerGrupp { id: MerGruppId; titel: string; rader: MerRad[] }

export interface MerIn {
  roll: KortRoll;
  /** inloggad som admin på riktigt (inte "Visa som"): får välja skördar-/skotarkörvy och byta vy */
  arAdmin: boolean;
  korvyAktiv: boolean;
  /** maskindatorn: hem leder till objektlistan, så startsidan (Inställningar, Förslag) nås inte därifrån */
  maskinlage: boolean;
  /** Skotning-knappen finns redan på kortet (förare på skotare/okänd maskin) → ingen dubblett i Mer */
  skotningFinnsSomKnapp: boolean;
  status: string | null;
  korvy?: { basKartaText: string; gpsText: string; gpsProblem: boolean; dataText: string; andrasSparText: string | null };
  vagdata?: { varde: string; misslyckad: boolean; kanKora: boolean } | null;
  tillTrakt: boolean;
  go: {
    skordarKorvy: () => void; skotarKorvy: () => void; avslutaKorvy: () => void; vaxlaBaskarta: () => void; gps: () => void; data: () => void; andrasSpar: () => void;
    skotning: () => void; markeraUtkort: () => void; genomgang: () => void;
    checklista: () => void; vagdata: () => void; trakt: () => void;
    lager: () => void; installningar: () => void; gpsKalla: (() => void) | null; forslag: () => void;
  };
}

/**
 * Mer: Körvy · Föraren · Planeraren · Övrigt, och "Avsluta objekt" för sig (röd, längst ner, bara när objektet är pågående).
 * "Planeraren" (Visa som, tilldelning, Klar — skicka till förare) är inga enkla rader — komponenten ritar dem som egna block och
 * gruppen finns här bara som rubrik när blocken ska visas (`planerarenBlock`).
 */
export function byggMerGrupper(c: MerIn): { grupper: MerGrupp[]; planerarenBlock: boolean; avslutaObjekt: boolean } {
  const grupper: MerGrupp[] = [];

  // KÖRVY — igång: all kontroll bor här (ren kartskärm). Inte igång: bara de körvyer som inte redan ligger som knapp (admin saknar knapp, förare har den).
  const korvy: MerRad[] = [];
  if (c.korvyAktiv && c.korvy) {
    korvy.push(
      { id: 'baskarta', etikett: c.korvy.basKartaText, ikon: 'layers', onTryck: c.go.vaxlaBaskarta },
      { id: 'gps', etikett: c.korvy.gpsText, ikon: 'my_location', onTryck: c.go.gps, farlig: c.korvy.gpsProblem },
      { id: 'kartdata', etikett: c.korvy.dataText, ikon: 'refresh', onTryck: c.go.data },
      ...(c.korvy.andrasSparText ? [{ id: 'andras-spar', etikett: c.korvy.andrasSparText, ikon: 'refresh', onTryck: c.go.andrasSpar }] : []),
      { id: 'avsluta-korvy', etikett: 'Avsluta körvy', ikon: 'close', onTryck: c.go.avslutaKorvy, farlig: true },
    );
  } else if (c.arAdmin) {
    korvy.push(
      { id: 'skordarkorvy', etikett: 'Skördarkörvy', ikon: 'navigation', onTryck: c.go.skordarKorvy },
      { id: 'skotarkorvy', etikett: 'Skotarkörvy', ikon: 'local_shipping', onTryck: c.go.skotarKorvy },
    );
  }
  if (korvy.length) grupper.push({ id: 'korvy', titel: 'Körvy', rader: korvy });

  // FÖRAREN — Markera utkört, Genomgång & kvittering (Briefing + Kvittera markeringar i ETT val: genomgången slutar med kvittering).
  // Skotning-arket (sortiment, högar) ligger här för dem som inte har den som knapp på kortet — annars nås det inte alls.
  const foraren: MerRad[] = [
    ...(c.skotningFinnsSomKnapp ? [] : [{ id: 'skotning', etikett: 'Skotning', under: 'Sortiment och högar', ikon: 'local_shipping', onTryck: c.go.skotning }]),
    { id: 'markera-utkort', etikett: 'Markera utkört', under: 'Rita det som är utkört', ikon: 'edit', onTryck: c.go.markeraUtkort },
    { id: 'genomgang', etikett: 'Genomgång & kvittering', under: 'Gå igenom trakten och kvittera markeringarna', ikon: 'menu_book', onTryck: c.go.genomgang },
  ];
  grupper.push({ id: 'foraren', titel: 'Föraren', rader: foraren });

  // PLANERAREN — blocken (Visa som, tilldelning) ritas av komponenten.
  const planerarenBlock = c.arAdmin || c.roll === 'planerare';
  if (planerarenBlock) grupper.push({ id: 'planeraren', titel: 'Planeraren', rader: [] });

  // ÖVRIGT — Checklista, Vägdata, Trakt (fakta, prognos, larm — redigeringen bor bara där). I körvy och maskinläge (där startsidan inte nås) även
  // Lager, Inställningar, GPS-källa och Förslag. Annars bor Inställningar och Förslag på startsidan.
  const ovrigt: MerRad[] = [
    { id: 'checklista', etikett: 'Checklista', ikon: 'check_circle', onTryck: c.go.checklista },
    ...(c.vagdata ? [{ id: 'vagdata', etikett: 'Vägdata', under: c.vagdata.varde, ikon: c.vagdata.misslyckad ? 'error' : 'route', onTryck: c.vagdata.kanKora ? c.go.vagdata : () => {}, farlig: c.vagdata.misslyckad }] : []),
    ...(c.tillTrakt ? [{ id: 'trakt', etikett: 'Trakt', under: 'Fakta, prognos, larm', ikon: 'info', onTryck: c.go.trakt }] : []),
  ];
  if (c.korvyAktiv) {
    ovrigt.push({ id: 'lager', etikett: 'Lager', under: 'Visa och dölj kartlager', ikon: 'layers', onTryck: c.go.lager });
  }
  if (c.korvyAktiv || c.maskinlage) {
    ovrigt.push({ id: 'installningar', etikett: 'Inställningar', under: 'Kompass, tillstånd, karta', ikon: 'settings', onTryck: c.go.installningar });
    if (c.go.gpsKalla) ovrigt.push({ id: 'gps-kalla', etikett: 'GPS-källa', under: 'Serieport och baudrate', ikon: 'gps_fixed', onTryck: c.go.gpsKalla });
    ovrigt.push({ id: 'forslag', etikett: 'Förslag', ikon: 'lightbulb', onTryck: c.go.forslag });
  }
  grupper.push({ id: 'ovrigt', titel: 'Övrigt', rader: ovrigt });

  return { grupper, planerarenBlock, avslutaObjekt: c.status === 'pagaende' };
}

// ── Brandrisk: fem dagar som små färgstreck ─────────────────────────────────────────────────────────────────────────

export interface BrandDag { dag: string; klass: number }
/** De fem första dagarna (idag först). Klassen 1–6 är SMHI:s MCF-klass — samma som veckolistan i brandriskpanelen. */
export function femDagar(daily: ReadonlyArray<{ date: string; dayName: string; fwiIndex: number }> | null | undefined, idagIso: string): BrandDag[] {
  if (!daily?.length) return [];
  const i = daily.findIndex((d) => d.date === idagIso);
  const fran = i > 0 ? [...daily.slice(i), ...daily.slice(0, i)] : [...daily];
  return fran.slice(0, 5).map((d) => ({ dag: d.dayName, klass: d.fwiIndex }));
}

/** Kortets färgbaserade klass bärs alltid av en siffra och ett ord bredvid (färg är aldrig ensam bärare). */
export function brandKlassText(klass: number): string {
  return ({ 1: 'Mycket liten', 2: 'Liten', 3: 'Måttlig', 4: 'Stor', 5: 'Mycket stor', 6: 'Extrem' } as Record<number, string>)[klass] ?? '';
}

