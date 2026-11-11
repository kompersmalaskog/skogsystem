// Cert › Behörigheter — ren logik (ingen databas, ingen React).
//
// Cert LÄSER Utbildning: behörigheterna bor i utbildning_typ / utbildning_krav / utbildning_bevis och vilka av dem som
// är SE-krav står i cert_se_krav. Utgångsdatumet (giltig_till) kommer färdigt ur vyn utbildning_status — här räknas bara
// DAGARNA dit, eftersom Cert varnar 60 dagar före (Utbildning varnar 90).
//
// Status lagras aldrig. Texten bär alltid budskapet ("HLR · 40 dagar"), färgen förstärker bara.

/** SE-kraven Cert känner till, i den ordning etiketterna står. `vaxel` = slås på per person i arket. */
export const SE_KRAV: Record<string, { etikett: string; ordning: number; vaxel?: string }> = {
  '3.1.1': { etikett: 'SYN', ordning: 0 },
  '3.1.10': { etikett: 'HLR', ordning: 1 },
  '3.1.9': { etikett: 'ADR', ordning: 2, vaxel: 'Kör farligt gods' },
  '3.1.8': { etikett: 'Natur', ordning: 3, vaxel: 'Planerar hänsyn' },
};

/** Den som har det här kravet kör maskin — och står därför i listan. */
export const KOR_MASKIN_KRAV = '3.1.1';

/** Varna så här många dagar före utgång (dag 60 räknas in). */
export const SNART_DAGAR = 60;

export type Lage = 'ok' | 'snart' | 'utgangen' | 'saknas';

export type Behorighet = {
  typId: string;
  seKrav: string;
  /** Utbildningens namn i katalogen ("SYN avverkning"). */
  namn: string;
  giltighetManader: number | null;
  bevisId: string | null;
  kursdatum: string | null;
  giltigTill: string | null;
  intygPath: string | null;
  uppladdadSe: boolean;
};

export type Person = { id: string; namn: string; behorigheter: Behorighet[] };

/** Hela dagar från `idag` till `datum` (YYYY-MM-DD). Negativt = passerat. */
export function dagarTill(datum: string, idag: string): number {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(datum) - d(idag)) / 86_400_000);
}

export function lageFor(b: Pick<Behorighet, 'bevisId' | 'giltigTill'>, idag: string): { lage: Lage; dagar: number | null } {
  if (!b.bevisId) return { lage: 'saknas', dagar: null };
  if (!b.giltigTill) return { lage: 'ok', dagar: null }; // ingen utgång
  const dagar = dagarTill(b.giltigTill, idag);
  if (dagar < 0) return { lage: 'utgangen', dagar };
  if (dagar <= SNART_DAGAR) return { lage: 'snart', dagar };
  return { lage: 'ok', dagar };
}

export function etikettNamn(seKrav: string): string {
  return SE_KRAV[seKrav]?.etikett ?? seKrav;
}

/** "SYN" · "HLR · 40 dagar" · "ADR · saknas" · "HLR · utgången" */
export function etikettText(b: Behorighet, idag: string): { text: string; lage: Lage } {
  const { lage, dagar } = lageFor(b, idag);
  const namn = etikettNamn(b.seKrav);
  if (lage === 'ok') return { text: namn, lage };
  if (lage === 'saknas') return { text: `${namn} · saknas`, lage };
  if (lage === 'utgangen') return { text: `${namn} · utgången`, lage };
  return { text: `${namn} · ${dagar === 0 ? 'idag' : dagar === 1 ? '1 dag' : `${dagar} dagar`}`, lage };
}

const RANG: Record<Lage, number> = { utgangen: 3, saknas: 2, snart: 1, ok: 0 };

function varst(p: Person, idag: string): number {
  return Math.max(0, ...p.behorigheter.map(b => RANG[lageFor(b, idag).lage]));
}

/** Problem först (utgånget, saknas, går ut snart), sedan alfabetiskt. */
export function sortera(personer: Person[], idag: string): Person[] {
  return [...personer].sort((a, b) => varst(b, idag) - varst(a, idag) || a.namn.localeCompare(b.namn, 'sv'));
}

const intyg = (n: number) => `${n} intyg`;

/** Vyns svar. Det värsta står i rubriken, resten på raden under. */
export function svar(personer: Person[], idag: string): { rubrik: string; rad?: string; avvikelse: boolean; tomt?: boolean } {
  const antal: Record<Lage, number> = { ok: 0, snart: 0, utgangen: 0, saknas: 0 };
  let medBevis = 0;
  for (const p of personer) for (const b of p.behorigheter) {
    antal[lageFor(b, idag).lage]++;
    if (b.bevisId) medBevis++;
  }
  if (medBevis === 0) return { rubrik: 'Inga intyg än', rad: 'Tryck på en förare och fota kursintyget.', avvikelse: false, tomt: true };
  const delar: { n: number; rubrik: string; kort: string }[] = [
    { n: antal.utgangen, rubrik: `${intyg(antal.utgangen)} har gått ut`, kort: `${antal.utgangen} har gått ut` },
    { n: antal.saknas, rubrik: `${intyg(antal.saknas)} saknas`, kort: `${antal.saknas} saknas` },
    { n: antal.snart, rubrik: `${intyg(antal.snart)} går ut snart`, kort: `${antal.snart} går ut snart` },
  ].filter(d => d.n > 0);
  if (delar.length === 0) return { rubrik: 'Alla är behöriga', avvikelse: false };
  return { rubrik: delar[0].rubrik, rad: delar.slice(1).map(d => d.kort).join(' · ') || undefined, avvikelse: true };
}

/** Kursdatum + giltighet, som databasen räknar (månadsslut kläms: 29 feb + 5 år = 28 feb). */
export function autoGiltigTill(kursdatum: string, manader: number | null): string {
  if (!kursdatum || manader == null) return '';
  const y = +kursdatum.slice(0, 4), m = +kursdatum.slice(5, 7) - 1, d = +kursdatum.slice(8, 10);
  if (!y || !d) return '';
  const tot = m + manader;
  const ny = y + Math.floor(tot / 12), nm = ((tot % 12) + 12) % 12;
  const sista = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, sista)).padStart(2, '0')}`;
}

export function giltighetText(manader: number | null): string {
  if (manader == null) return 'Ingen utgång.';
  return `Räknas ut: kursdatum + ${manader % 12 === 0 ? `${manader / 12} år` : `${manader} månader`}. Går att ändra.`;
}

export function svenskIdag(nu: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(nu);
}

// ---- Arkets formulär ----

export type Falt = { kursdatum: string; giltigTill: string; uppladdadSe: boolean; nyttFoto: boolean; taBort: boolean };

export function startFalt(b: Behorighet): Falt {
  return { kursdatum: b.kursdatum ?? '', giltigTill: b.giltigTill ?? '', uppladdadSe: b.uppladdadSe, nyttFoto: false, taBort: false };
}

export function andrad(b: Behorighet, f: Falt): boolean {
  const s = startFalt(b);
  return f.taBort || f.nyttFoto || f.kursdatum !== s.kursdatum || f.giltigTill !== s.giltigTill || f.uppladdadSe !== s.uppladdadSe;
}

/** Ett ändrat intyg går bara att spara med kursdatum, och giltig till får inte ligga före kursen. */
export function giltig(f: Falt): boolean {
  if (f.taBort) return true;
  if (!f.kursdatum) return false;
  return !f.giltigTill || f.giltigTill >= f.kursdatum;
}
