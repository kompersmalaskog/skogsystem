// SÅ GÖR VI (arbetsmiljö, 2026-11-04). AFS 2023:1: arbetsuppgifter med ALLVARLIGA risker ska ha skriftliga instruktioner.
// Bara de jobben, inget annat (Martin: "bara det lagen kräver, annars slutar alla använda det"). Som en IKEA-manual: en rubrik,
// när den gäller, och 3–5 numrerade steg med en rad var. Admin kan ändra stegen och trycker Stämmer; föraren trycker "Jag har läst".
// Godkännandet och kvittot gäller exakt stegen (fingeravtryck) — ändras en text gäller de inte längre. Samma modell som riskbedömningen.
//
// Texterna står HÄR (appens standard). Lagring: am_sa_gor_vi (admins ändrade steg + godkännandet) och am_sa_gor_vi_last (kvittot).
// Ren logik överst, läsning och skrivning längst ner.

import type { SupabaseClient } from '@supabase/supabase-js';

export type InstrId = 'hydraulslang' | 'trailer' | 'kraftledning' | 'motorsag' | 'heta_arbeten' | 'ensam' | 'brant' | 'bargning';
// Ordning: det farligaste först.
export const INSTR_IDN: InstrId[] = ['kraftledning', 'brant', 'bargning', 'motorsag', 'hydraulslang', 'trailer', 'heta_arbeten', 'ensam'];

/** Var texten är kontrollerad. Bara en länk – ingen text eller bild kopieras. */
export type Kalla = { text: string; url: string };
export type Instruktion = { id: InstrId; titel: string; nar: string; steg: string[]; kalla?: Kalla };

export const MIN_STEG = 3;
export const MAX_STEG = 5;

export const KATALOG: Record<InstrId, Omit<Instruktion, 'id'>> = {
  hydraulslang: {
    titel: 'Byta hydraulslang',
    nar: 'En slang läcker eller har spruckit',
    steg: [
      'Sänk kranen och aggregatet till marken.',
      'Stäng av motorn och rör spakarna så trycket går ur. Töm ackumulatorn om maskinen har en.',
      'Handskar och skyddsglasögon på.',
      'Byt slangen. Känn aldrig efter läckor med handen.',
      'Torka upp spill. Gamla slangen och trasorna i farligt avfall.',
    ],
  },
  trailer: {
    titel: 'Lasta maskin på trailer',
    nar: 'När en maskin ska flyttas med lastbilen',
    steg: [
      'Plan och fast mark. Ingen människa nära.',
      'Kör sakta och rakt upp på ramperna.',
      'Kranen ner och surrad. Parkeringsbroms, lägsta växeln, låst midja.',
      'Surra i maskinens surrningsöglor: minst två kedjor framåt och två bakåt.',
      'Stanna efter en kort bit och kolla surrningen igen.',
    ],
    kalla: { text: 'TYA · Branschnorm lastsäkring', url: 'https://forankra.bynder.com/m/4b0cc9e45ce0f81/original/TYA-Branschnorm_Lastsakring.pdf' },
  },
  kraftledning: {
    titel: 'Nära kraftledning',
    nar: 'Trakten har en ledning (röd på kartan)',
    steg: [
      'Se på kartan var ledningen går innan du börjar.',
      'Kan trädet hamna inom 10 m från ledningen: ring nätägaren innan du fäller.',
      'Rör kranen ledningen: sitt kvar i hytten och försök köra loss. Ring nätägaren. Skadad eller brand: 112.',
      'Måste du ut: hoppa jämfota. Rör aldrig maskinen och marken samtidigt.',
      'Gå med små skutt minst 20 m bort.',
    ],
    kalla: { text: 'Elsäkerhetsverket · Säkerhet nära elektriska ledningar', url: 'https://www.elsakerhetsverket.se/globalassets/pdf/anlaggning/sakerhet-nara-elektriska-ledningar.pdf' },
  },
  motorsag: {
    titel: 'Fälla svåra träd med motorsåg',
    nar: 'Vindfällen, hängande eller spända träd',
    steg: [
      'Skyddsbyxor, hjälm med visir och kängor med sågskydd.',
      'Ingen inom två trädlängder.',
      'Bestäm fallriktning och en undanväg snett bakåt innan du sågar.',
      'Hängande eller hårt spänt träd: ta det med maskinen.',
      'Någon ska veta var du är och när du är klar.',
    ],
    kalla: { text: 'Husqvarna · Förbered trädfällning', url: 'https://www.husqvarna.com/se/utforska-och-upptack/chainsaw-academy/grundlaggande-tradfallning/hur-man-forbereder-tradfallning/' },
  },
  heta_arbeten: {
    titel: 'Svetsa och slipa i skogen',
    nar: 'Svets, vinkelslip eller skärbrännare utomhus',
    steg: [
      'Kolla brandrisken i appen. Är den hög: vänta.',
      'Rensa bort ris och barr runt platsen.',
      'Släckaren och vatten framme innan du börjar.',
      'Vakta platsen en timme efteråt.',
    ],
  },
  ensam: {
    titel: 'Ensam i skogen',
    nar: 'När du jobbar utan någon i närheten',
    steg: [
      'Säg till var du är och när du slutar.',
      'Ha telefonen på dig, laddad.',
      'Hör av dig när du är klar.',
      'Hör ingen av dig ringer arbetsledningen. Svarar du inte åker någon dit.',
    ],
    kalla: { text: 'Skogforsk · Säker i skogen: Ensamarbete', url: 'https://www.skogforsk.se/rad--stod/filmer--publikationer/saker-i-skogen/' },
  },
  brant: {
    titel: 'Köra i brant terräng',
    nar: 'Där maskinen kan välta eller glida (röda streck på kartan)',
    steg: [
      'Se på kartan var det är brant innan du kör dit.',
      'Kör rakt upp och ner. Aldrig tvärs över backen.',
      'Kör hellre tom uppför och lastad nedför.',
      'Bältet på. Börjar maskinen tippa: stanna i hytten.',
      'Ser det för brant ut: kör inte. Ring arbetsledningen.',
    ],
  },
  bargning: {
    titel: 'Bärga en maskin som kört fast',
    nar: 'När en maskin ska dras loss med en annan',
    steg: [
      'Säg till någon vad du gör. Gör det inte värre – be om hjälp tidigt.',
      'Dra bara i maskinens bärgningspunkter. Kolla att vajer, block och band är hela.',
      'Säkra kroken med en extra lina till en annan fast punkt.',
      'Ingen får stå där vajern slår om den brister.',
      'Kom överens om tecken innan ni drar. Gräv bort stubbar och sten först.',
    ],
    kalla: { text: 'Skogforsk · Checklista vid bärgning', url: 'https://www.skogforsk.se/cd_20190114162704/contentassets/c65abaa12fd84a578be7cc3b44794ddb/checklista-vid-bargning-171024.pdf' },
  },
};

export type Godkannande = { steg: string[] | null; godkandUnderlag: string | null; godkandTid: string | null };
export const TOM: Godkannande = { steg: null, godkandUnderlag: null, godkandTid: null };

/** Instruktionen som gäller: admins ändrade steg, annars appens. */
export function instruktion(id: InstrId, g: Godkannande | undefined): Instruktion {
  const k = KATALOG[id];
  return { id, titel: k.titel, nar: k.nar, kalla: k.kalla, steg: g?.steg && g.steg.length >= MIN_STEG ? g.steg : k.steg };
}

/** Är stegen ändrade från appens? */
export function arAndrad(id: InstrId, g: Godkannande | undefined): boolean {
  return !!g?.steg && underlag(instruktion(id, g)) !== underlag({ ...KATALOG[id], id });
}

/** Fingeravtrycket: id + stegen i ordning (ordningen spelar roll i en instruktion). */
export function underlag(i: Pick<Instruktion, 'id' | 'steg'>): string {
  return `${i.id}:${i.steg.map(s => s.trim()).join('§')}`;
}

export const SE_OVER_DAGAR = 365;
export type Lage = 'godkand' | 'se_over' | 'andrad' | 'aldrig';

export function lage(id: InstrId, g: Godkannande | undefined, nu: Date): Lage {
  if (!g?.godkandUnderlag || !g.godkandTid) return 'aldrig';
  if (g.godkandUnderlag !== underlag(instruktion(id, g))) return 'andrad';
  return nu.getTime() - new Date(g.godkandTid).getTime() > SE_OVER_DAGAR * 86_400_000 ? 'se_over' : 'godkand';
}

/** Föraren ser bara godkända (också en som borde ses över — den gäller tills den ändras). */
export const synligForForare = (l: Lage) => l === 'godkand' || l === 'se_over';

/** Rensa stegen innan de sparas: tomma bort, högst MAX_STEG, högst 200 tecken. null = färre än MIN_STEG. */
export function rensaSteg(steg: readonly string[]): string[] | null {
  const ut = steg.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, MAX_STEG).map(s => s.slice(0, 200));
  return ut.length >= MIN_STEG ? ut : null;
}

export type Kvitto = { medarbetareId: string; instruktion: InstrId; underlag: string; tid: string };

export function lastTid(kvitton: readonly Kvitto[], medarbetareId: string, i: Instruktion): string | null {
  const u = underlag(i);
  return kvitton.find(k => k.medarbetareId === medarbetareId && k.instruktion === i.id && k.underlag === u)?.tid ?? null;
}

/** De godkända föraren inte läst (i ordning). */
export function attLasa(g: Partial<Record<InstrId, Godkannande>>, kvitton: readonly Kvitto[], medarbetareId: string, nu: Date): InstrId[] {
  return INSTR_IDN.filter(id => synligForForare(lage(id, g[id], nu)) && !lastTid(kvitton, medarbetareId, instruktion(id, g[id])));
}

/** Svaret överst. */
export function svar(arAdmin: boolean, g: Partial<Record<InstrId, Godkannande>>, kvitton: readonly Kvitto[], medarbetareId: string, nu: Date): { text: string; ton?: 'orange' } {
  if (arAdmin) {
    const att = INSTR_IDN.filter(id => lage(id, g[id], nu) !== 'godkand').length;
    return att === 0 ? { text: 'Alla är godkända' } : { text: `${att} av ${INSTR_IDN.length} att godkänna`, ton: 'orange' };
  }
  const synliga = INSTR_IDN.filter(id => synligForForare(lage(id, g[id], nu)));
  if (synliga.length === 0) return { text: 'Instruktionerna är inte klara än' };
  const kvar = attLasa(g, kvitton, medarbetareId, nu).length;
  if (kvar === 0) return { text: 'Du har läst allt ✓' };
  return { text: kvar === 1 ? '1 att läsa' : `${kvar} att läsa`, ton: 'orange' };
}

// ── Läsning och skrivning ──────────────────────────────────────────────────────────────────────────────────────────

type Rad = { id: string; steg: unknown; godkand_underlag: string | null; godkand_tid: string | null };

export function tolka(r: Partial<Rad> | undefined): Godkannande {
  if (!r) return { ...TOM };
  const steg = Array.isArray(r.steg) ? r.steg.filter((s): s is string => typeof s === 'string') : null;
  return { steg: steg && steg.length >= MIN_STEG ? steg : null, godkandUnderlag: r.godkand_underlag ?? null, godkandTid: r.godkand_tid ?? null };
}

/** null = kunde inte läsas (aldrig "inget godkänt"). */
export async function hamta(sb: SupabaseClient): Promise<Record<InstrId, Godkannande> | null> {
  const { data, error } = await sb.from('am_sa_gor_vi').select('id, steg, godkand_underlag, godkand_tid');
  if (error || !Array.isArray(data)) return null;
  const ut = {} as Record<InstrId, Godkannande>;
  for (const id of INSTR_IDN) ut[id] = tolka((data as Rad[]).find(r => r.id === id));
  return ut;
}

/** Nya steg (null = tillbaka till appens). Godkännandet står kvar men gäller inte längre (fingeravtrycket ändras). */
export async function sparaSteg(sb: SupabaseClient, id: InstrId, steg: string[] | null, g: Godkannande): Promise<boolean> {
  const { error } = await sb.from('am_sa_gor_vi').upsert({ id, steg, godkand_underlag: g.godkandUnderlag }, { onConflict: 'id' });
  return !error;
}

/** Stämmer: databasen sätter vem och när. */
export async function godkann(sb: SupabaseClient, i: Instruktion, g: Godkannande): Promise<boolean> {
  const { error } = await sb.from('am_sa_gor_vi').upsert({ id: i.id, steg: g.steg, godkand_underlag: underlag(i) }, { onConflict: 'id' });
  return !error;
}

/** null = kunde inte läsas. RLS ger en förare bara sina egna. */
export async function hamtaKvitton(sb: SupabaseClient): Promise<Kvitto[] | null> {
  const { data, error } = await sb.from('am_sa_gor_vi_last').select('medarbetare_id, instruktion, underlag, tid');
  if (error || !Array.isArray(data)) return null;
  return (data as { medarbetare_id: string; instruktion: InstrId; underlag: string; tid: string }[])
    .filter(k => INSTR_IDN.includes(k.instruktion))
    .map(k => ({ medarbetareId: k.medarbetare_id, instruktion: k.instruktion, underlag: k.underlag, tid: k.tid }));
}

/** "Jag har läst". Redan läst räknas som lyckat. */
export async function kvittera(sb: SupabaseClient, medarbetareId: string, i: Instruktion): Promise<boolean> {
  const { error } = await sb.from('am_sa_gor_vi_last').insert({ medarbetare_id: medarbetareId, instruktion: i.id, underlag: underlag(i) });
  return !error || error.code === '23505';
}
