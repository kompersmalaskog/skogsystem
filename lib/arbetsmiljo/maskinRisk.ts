// RISKBEDÖMNING PER MASKINTYP (arbetsmiljö, 2026-11-02). AFS 2023:1 kräver att arbetsgivaren bedömer riskerna i ARBETET, skriftligt, och ser
// över bedömningen regelbundet. Trakternas riskbedömning (lib/riskbedomning) gäller platsen; den här gäller själva maskinen och görs en gång,
// ses över varje år och när något ändras (ny maskin, en olycka).
//
// Riskerna och åtgärderna står HÄR (ändras här). Admin tar bort det som inte gäller hos oss, lägger till egna och trycker Stämmer; föraren
// läser och trycker "Jag har läst". Godkännandet och kvittot gäller exakt listan (fingeravtryck) — ändras en text gäller de inte längre.
// Ren logik, ingen React. Lagring: am_riskbedomning (en rad per typ) och am_riskbedomning_last (kvittot).
//
// ALLVARLIG ELLER MINDRE ALLVARLIG (2026-11-05, AFS 2023:1 11 §: dokumentationen ska säga OM riskerna är allvarliga). Allt är Allvarligt från
// början; admin ändrar med ett tryck (`mindre` = nycklarna som är mindre allvarliga, kolumnen am_riskbedomning.mindre, migration
// 20261105120000_am_riskbedomning_mindre.sql). En mindre allvarlig risk ändrar fingeravtrycket (`|mindre`); en allvarlig gör det inte, så
// godkännanden och kvitton från före ändringen gäller som förut. Saknas kolumnen läses allt som Allvarligt och valet sparas inte.

import type { SupabaseClient } from '@supabase/supabase-js';

// 'kemikalier' (2026-11-03) är ingen maskin utan arbetsmomenten med oljor, bränsle, sprayer och avgaser (AFS 2023:10).
// Den gäller ALLA förare (ALLA_LASER), inte bara de med en viss maskin. Namnet MaskinTyp står kvar (kolumnen heter maskintyp).
export type MaskinTyp = 'skordare' | 'skotare' | 'lastbil' | 'motorsag' | 'kemikalier';
export const MASKINTYPER: MaskinTyp[] = ['skordare', 'skotare', 'lastbil', 'motorsag', 'kemikalier'];
/** Typer som alla förare ska läsa, oavsett maskin. */
export const ALLA_LASER: readonly MaskinTyp[] = ['kemikalier'];

export const TYP_NAMN: Record<MaskinTyp, string> = {
  skordare: 'Skördare', skotare: 'Skotare', lastbil: 'Lastbil', motorsag: 'Motorsåg', kemikalier: 'Oljor och kemikalier',
};
/** "Läs riskerna för skotaren" */
export const TYP_BESTAMD: Record<MaskinTyp, string> = {
  skordare: 'skördaren', skotare: 'skotaren', lastbil: 'lastbilen', motorsag: 'motorsågen', kemikalier: 'oljor och kemikalier',
};

export type MaskinRisk = { nyckel: string; risk: string; atgard: string; egen: boolean; allvarlig: boolean };

const R = (nyckel: string, risk: string, atgard: string) => ({ nyckel, risk, atgard });

const PASTIGNING = R('pastigning', 'Halka när du går upp eller ner', 'Gå baklänges och håll i med tre punkter. Hoppa aldrig.');
const BRAND = R('brand', 'Brand i maskinen', 'Blås rent motorrummet varje dag. Slå av huvudströmmen när du går ifrån. Släckarna ska visa grönt.');
const SLANG = R('slang', 'Hydraulslang som spricker', 'Känn aldrig efter läckor med handen. Sänk kranen och stäng av innan du lagar.');
const VALT = R('valt', 'Maskinen välter', 'Kör rakt upp och ner i branter, aldrig snett. Ha bältet på.');
const ENSAM = R('ensam', 'Ensam i skogen', 'Någon ska veta var du är. Ha telefonen på dig. I stormfälld skog jobbar du aldrig ensam.');
const TROTT = R('trott', 'Trötthet och långa dagar', 'Ta rast. Säg till om dagarna blir för långa.');
const SKAK = R('skak', 'Skakningar och buller', 'Ställ in stolen så du sitter bra. Ha hörselskydd när du är ute och motorn går.');

/** Katalogen. Ordningen är den som visas. */
export const KATALOG: Record<MaskinTyp, readonly { nyckel: string; risk: string; atgard: string }[]> = {
  skordare: [
    R('folk', 'Folk nära maskinen', 'Är någon närmare än 70 meter: stanna och vänta tills ni har pratat med varandra.'),
    R('kedjeskott', 'Kedjeskott från sågen', 'Kedjefångaren ska vara hel. Byt en sprucken ruta direkt. Ingen får stå i sågens riktning.'),
    R('under_kran', 'Arbete nära kranen eller aggregatet', 'Lägg ner aggregatet på marken och stäng av innan du går nära.'),
    BRAND, SLANG, VALT, PASTIGNING, ENSAM, TROTT, SKAK,
  ],
  skotare: [
    R('folk', 'Folk nära maskinen', 'Är någon närmare än 20 meter: stanna kranen och vänta tills ni har pratat med varandra.'),
    R('last', 'Last som rasar', 'Lasta aldrig högre än lastgrinden och stöttorna.'),
    R('under_kran', 'Arbete nära kranen', 'Lägg ner gripen på marken och stäng av innan du går nära.'),
    BRAND, SLANG, VALT, PASTIGNING, ENSAM, TROTT, SKAK,
  ],
  lastbil: [
    R('lasta', 'Maskinen glider vid lastning', 'Lasta på plan, fast mark. Kör sakta upp på ramperna.'),
    R('surra', 'Maskinen lossnar under färd', 'Surra med minst fyra kedjor. Kolla surrningen igen efter en kort bit.'),
    R('hojd', 'För högt under broar och ledningar', 'Sänk kranen och hytten. Vet hur högt ekipaget är innan du kör.'),
    R('trafik', 'Trafik när du lastar vid vägen', 'Ha varselkläder på. Ställ ut varningstriangeln.'),
    R('flak', 'Halka på flaket', 'Håll i med tre punkter. Gå inte på flaket när det är isigt.'),
    TROTT,
  ],
  motorsag: [
    R('kast', 'Kast från sågen', 'Ha skyddsbyxor, hjälm med visir, hörselskydd och kängor med sågskydd. Kedjebromsen ska fungera.'),
    R('fallning', 'Trädet faller fel', 'Bestäm fallriktning och vart du går undan innan du sågar. Ingen inom två trädlängder.'),
    R('hangande', 'Hängande träd', 'Gå aldrig under ett hängande träd. Ta ner det med maskinen.'),
    R('korkort', 'Utan utbildning', 'Du ska ha motorsågskörkort för det du gör.'),
    R('ensam_sag', 'Ensam med motorsåg', 'Någon ska veta var du är och när du är klar.'),
    R('vibration', 'Vibrationer i händerna', 'Ta pauser. Säg till om fingrarna blir vita eller domnar.'),
  ],
  // Per arbetsmoment. Faromärkningen och första hjälpen för varje produkt står i säkerhetsbladet (Kemikalier).
  kemikalier: [
    R('tanka', 'Diesel och AdBlue när du tankar', 'Ha handskar. Tvätta händerna efteråt. Ingen rökning eller eld nära.'),
    R('hydraulolja', 'Hydraulolja på huden eller i ögonen', 'Ha handskar och skyddsglasögon när du byter slang eller filter. Olja i ögat: skölj i 15 minuter.'),
    R('hogtryck', 'Olja som sprutar under högt tryck', 'Känn aldrig efter läckor med handen. Har olja gått in under huden: åk till sjukhus direkt, även om det inte gör ont.'),
    R('kedjeolja', 'Kedjeolja och motorolja', 'Ha handskar när du fyller på. Byt kläder som blivit genomblöta av olja.'),
    R('spray', 'Sprayer och avfettning', 'Spraya utomhus eller med porten öppen. Ingen eld eller gnistor nära.'),
    R('bensin', 'Bensin och alkylatbensin', 'Förvara i godkänd dunk, svalt och långt från eld. Tanka inte en varm motorsåg.'),
    R('stubbe', 'Medel för stubbehandling', 'Ha handskar när du fyller på. Gör som det står på etiketten.'),
    R('avgaser', 'Avgaser', 'Kör inte motorn i hallen med porten stängd.'),
    R('spill', 'Spill i naturen', 'Saneringssatsen ska finnas i maskinen. Stoppa läckan, lägg på absorbent och ring arbetsledningen vid större spill.'),
    R('ny_produkt', 'Något nytt du inte känner till', 'Läs säkerhetsbladet i appen under Kemikalier innan du använder det. Finns det inte: lägg till produkten.'),
  ],
};

export type EgenRisk = { id: string; risk: string; atgard: string };

export type Bedomning = {
  bort: string[];
  egna: EgenRisk[];
  /** nycklar som admin sagt är MINDRE allvarliga (allt annat är allvarligt) */
  mindre: string[];
  godkandUnderlag: string | null;
  godkandTid: string | null;
  godkandAv: string | null;
};

export const TOM: Bedomning = { bort: [], egna: [], mindre: [], godkandUnderlag: null, godkandTid: null, godkandAv: null };

/** Listan som gäller: katalogen utom det som inte gäller, sedan de egna. */
export function lista(typ: MaskinTyp, b: Bedomning): MaskinRisk[] {
  const bort = new Set(b.bort);
  const mindre = new Set(b.mindre ?? []);
  return [
    ...KATALOG[typ].filter(r => !bort.has(r.nyckel)).map(r => ({ ...r, egen: false, allvarlig: !mindre.has(r.nyckel) })),
    ...b.egna.map(e => ({ nyckel: `egen:${e.id}`, risk: e.risk, atgard: e.atgard, egen: true, allvarlig: !mindre.has(`egen:${e.id}`) })),
  ];
}

export function borttagna(typ: MaskinTyp, b: Bedomning): MaskinRisk[] {
  const bort = new Set(b.bort);
  return KATALOG[typ].filter(r => bort.has(r.nyckel)).map(r => ({ ...r, egen: false, allvarlig: true }));
}

/** Fingeravtrycket. En ändrad text är en ny bedömning; ordningen spelar ingen roll. */
export function underlag(risker: readonly MaskinRisk[]): string {
  return risker.map(r => `${r.nyckel}=${r.risk.trim()}|${r.atgard.trim()}${r.allvarlig === false ? '|mindre' : ''}`).sort().join('§') || 'inga';
}

export const SE_OVER_DAGAR = 365;

/** godkand = Stämmer på exakt den här listan (yngre än ett år) · se_over = godkänd för över ett år sedan · andrad = listan ändrad efter
 *  godkännandet · aldrig = ingen har godkänt. */
export type Lage = 'godkand' | 'se_over' | 'andrad' | 'aldrig';

export function lage(typ: MaskinTyp, b: Bedomning, nu: Date): Lage {
  if (!b.godkandUnderlag || !b.godkandTid) return 'aldrig';
  if (b.godkandUnderlag !== underlag(lista(typ, b))) return 'andrad';
  return nu.getTime() - new Date(b.godkandTid).getTime() > SE_OVER_DAGAR * 86_400_000 ? 'se_over' : 'godkand';
}

/** Föraren ser en bedömning som admin godkänt (också en som borde ses över — den gäller tills den ändras). */
export function synligForForare(l: Lage): boolean {
  return l === 'godkand' || l === 'se_over';
}

export function antalText(n: number): string {
  return n === 1 ? '1 risk' : `${n} risker`;
}

// ── Ändringar (rena) ─────────────────────────────────────────────────────────────────────────────────────────────────

export function taBort(b: Bedomning, nyckel: string): Bedomning {
  if (nyckel.startsWith('egen:')) return { ...b, egna: b.egna.filter(e => `egen:${e.id}` !== nyckel), mindre: (b.mindre ?? []).filter(n => n !== nyckel) };
  return b.bort.includes(nyckel) ? b : { ...b, bort: [...b.bort, nyckel] };
}

export function taTillbaka(b: Bedomning, nyckel: string): Bedomning {
  return { ...b, bort: b.bort.filter(n => n !== nyckel) };
}

/** Allvarlig eller mindre allvarlig, ett tryck. */
export function sattAllvarlig(b: Bedomning, nyckel: string, allvarlig: boolean): Bedomning {
  const utan = (b.mindre ?? []).filter(n => n !== nyckel);
  return { ...b, mindre: allvarlig ? utan : [...utan, nyckel] };
}

/** null = risk eller åtgärd saknas. */
export function laggTill(b: Bedomning, id: string, risk: string, atgard: string): Bedomning | null {
  const r = risk.trim(), a = atgard.trim();
  if (!r || !a) return null;
  return { ...b, egna: [...b.egna, { id, risk: r.slice(0, 120), atgard: a.slice(0, 280) }] };
}

// ── Lagring ──────────────────────────────────────────────────────────────────────────────────────────────────────────

type Rad = { maskintyp: string; bort: unknown; egna: unknown; mindre?: unknown; godkand_underlag: string | null; godkand_tid: string | null; godkand_av: string | null };

export function tolka(r: Partial<Rad> | null | undefined): Bedomning {
  if (!r) return { ...TOM, bort: [], egna: [], mindre: [] };
  const bort = Array.isArray(r.bort) ? r.bort.filter((x): x is string => typeof x === 'string') : [];
  const egna = Array.isArray(r.egna)
    ? r.egna.flatMap(e => {
      const x = e as Record<string, unknown> | null;
      return x && typeof x.id === 'string' && typeof x.risk === 'string' && typeof x.atgard === 'string' ? [{ id: x.id, risk: x.risk, atgard: x.atgard }] : [];
    })
    : [];
  const mindre = Array.isArray(r.mindre) ? r.mindre.filter((x): x is string => typeof x === 'string') : [];
  return { bort, egna, mindre, godkandUnderlag: r.godkand_underlag ?? null, godkandTid: r.godkand_tid ?? null, godkandAv: r.godkand_av ?? null };
}

/** Alla fyra. null = kunde inte läsas (aldrig "ingen bedömning gjord"). En typ utan rad är en bedömning ingen rört. */
/** Saknas kolumnen `mindre` (migrationen ej körd)? */
export function saknarMindre(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /mindre/.test(error.message ?? ''));
}

/** Går valet Allvarlig/Mindre allvarlig att spara? Sätts av läsningen; false = kolumnen saknas. */
export let mindreKolumnFinns = true;

export async function hamtaBedomningar(sb: SupabaseClient): Promise<Record<MaskinTyp, Bedomning> | null> {
  let { data, error } = await sb.from('am_riskbedomning').select('maskintyp, bort, egna, mindre, godkand_underlag, godkand_tid, godkand_av');
  if (saknarMindre(error)) {
    mindreKolumnFinns = false;
    ({ data, error } = await sb.from('am_riskbedomning').select('maskintyp, bort, egna, godkand_underlag, godkand_tid, godkand_av'));
  } else if (!error) mindreKolumnFinns = true;
  if (error || !Array.isArray(data)) return null;
  const ut = {} as Record<MaskinTyp, Bedomning>;
  for (const t of MASKINTYPER) ut[t] = tolka((data as Rad[]).find(r => r.maskintyp === t));
  return ut;
}

/** Sparar bort och egna. Godkännandet rörs inte (databasen behåller det; listan räknas om i appen). */
export async function sparaListan(sb: SupabaseClient, typ: MaskinTyp, b: Bedomning): Promise<boolean> {
  const rad = { maskintyp: typ, bort: b.bort, egna: b.egna, godkand_underlag: b.godkandUnderlag };
  return spara(sb, rad, b);
}

/** Skriver `mindre` bara när kolumnen finns; saknas den och något är mindre allvarligt är det ett fel (sägs), aldrig en tyst förlust. */
async function spara(sb: SupabaseClient, rad: Record<string, unknown>, b: Bedomning): Promise<boolean> {
  const mindre = b.mindre ?? [];
  if (mindreKolumnFinns) {
    const { error } = await sb.from('am_riskbedomning').upsert({ ...rad, mindre }, { onConflict: 'maskintyp' });
    if (!saknarMindre(error)) return !error;
    mindreKolumnFinns = false;
  }
  if (mindre.length > 0) return false;
  const { error } = await sb.from('am_riskbedomning').upsert(rad, { onConflict: 'maskintyp' });
  return !error;
}

/** Stämmer: databasen sätter vem och när. */
export async function godkann(sb: SupabaseClient, typ: MaskinTyp, b: Bedomning): Promise<boolean> {
  return spara(sb, { maskintyp: typ, bort: b.bort, egna: b.egna, godkand_underlag: underlag(lista(typ, b)) }, b);
}

export type Kvitto = { medarbetareId: string; maskintyp: MaskinTyp; underlag: string; tid: string };

/** null = kunde inte läsas. RLS ger en förare bara sina egna. */
export async function hamtaKvitton(sb: SupabaseClient): Promise<Kvitto[] | null> {
  const { data, error } = await sb.from('am_riskbedomning_last').select('medarbetare_id, maskintyp, underlag, tid');
  if (error || !Array.isArray(data)) return null;
  return (data as { medarbetare_id: string; maskintyp: MaskinTyp; underlag: string; tid: string }[])
    .filter(k => MASKINTYPER.includes(k.maskintyp))
    .map(k => ({ medarbetareId: k.medarbetare_id, maskintyp: k.maskintyp, underlag: k.underlag, tid: k.tid }));
}

/** "Jag har läst". Redan läst (unik nyckel) räknas som lyckat. */
export async function kvittera(sb: SupabaseClient, medarbetareId: string, typ: MaskinTyp, u: string): Promise<boolean> {
  const { error } = await sb.from('am_riskbedomning_last').insert({ medarbetare_id: medarbetareId, maskintyp: typ, underlag: u });
  return !error || error.code === '23505';
}

/** Kvittot på exakt den listan som gäller nu, eller null. */
export function lastTid(kvitton: readonly Kvitto[], medarbetareId: string, typ: MaskinTyp, u: string): string | null {
  return kvitton.find(k => k.medarbetareId === medarbetareId && k.maskintyp === typ && k.underlag === u)?.tid ?? null;
}

/** dim_maskin.maskin_typ → typen föraren måste läsa. Okänd = ingen. */
export function typForMaskin(maskinTyp: string | null | undefined): MaskinTyp | null {
  return maskinTyp === 'Harvester' ? 'skordare' : maskinTyp === 'Forwarder' ? 'skotare' : null;
}

// ── Startsidans Behöver dig ──────────────────────────────────────────────────────────────────────────────────────────

/** Admin: hur många bedömningar som behöver ett Stämmer (aldrig godkänd, ändrad eller över ett år gammal). null = inget att göra. */
export function adminRad(bedomningar: Record<MaskinTyp, Bedomning>, nu: Date): string | null {
  const att = MASKINTYPER.filter(t => lage(t, bedomningar[t], nu) !== 'godkand').length;
  if (att === 0) return null;
  return att === 1 ? '1 riskbedömning att godkänna' : `${att} riskbedömningar att godkänna`;
}

/** Typerna föraren ska läsa: sin maskin först, sedan de alla läser. */
export function forarensTyper(typ: MaskinTyp | null): MaskinTyp[] {
  return [...(typ ? [typ] : []), ...ALLA_LASER.filter(t => t !== typ)];
}

/** De av förarens typer som är godkända men inte lästa (i ordning). */
export function attLasa(typ: MaskinTyp | null, bedomningar: Record<MaskinTyp, Bedomning>, kvitton: readonly Kvitto[], medarbetareId: string, nu: Date): MaskinTyp[] {
  return forarensTyper(typ).filter(t => {
    const b = bedomningar[t];
    return synligForForare(lage(t, b, nu)) && !lastTid(kvitton, medarbetareId, t, underlag(lista(t, b)));
  });
}

/** Föraren: läs riskerna för sin maskin, och för oljor och kemikalier, när de är godkända och inte lästa. */
export function forarRad(typ: MaskinTyp | null, bedomningar: Record<MaskinTyp, Bedomning>, kvitton: readonly Kvitto[], medarbetareId: string, nu: Date): string | null {
  const kvar = attLasa(typ, bedomningar, kvitton, medarbetareId, nu);
  return kvar.length === 0 ? null : `Läs riskerna för ${kvar.map(t => TYP_BESTAMD[t]).join(' och ')}`;
}
